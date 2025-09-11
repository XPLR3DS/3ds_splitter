import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Document, Node, NodeIO, Primitive ,Mesh, PropertyType ,vec3} from '@gltf-transform/core';
import * as gtf from '@gltf-transform/functions';
import * as fs from 'fs/promises';
import { error } from 'console';
import { write, existsSync, mkdirSync, read , createReadStream} from 'fs';
import { Command } from 'commander';
import * as path from 'path';

const CLI = new Command();

interface Config {
  inputPathGLB: string;
  outputPath: string;
  fileName: string;
  inputPathBIN: string;
  inputPathGLTF: string;
  threshold: number;
}

const command = new Command();

command.option('-i, --inputglb <path>', 'input GLB file path')
    .option('-b, --inputbin <path>', 'input BIN file path')
    .option('-g, --inputgltf <path>', 'input GLTF file path')
    .option('-o, --output <path>', 'output directory path " defaults to ./ "',"./")
    .requiredOption('-n, --name <name>', 'base filename ')
    .option('-m, --threshold <number>','target memory_threshold for each file " defaults to 40000000','40000000')
    .option('-l, --limit <number>', 'file size limit in GB for streaming mode " defaults to 2','2')
    .parse(process.argv);

const options = command.opts();
if (!options.inputglb && !options.inputgltf) {
    console.error('Error: You must provide either --inputglb or --inputgltf');
    process.exit(1);
}

const inputFile = options.inputglb || options.inputgltf;

const config: Config = {
      fileName: options.name,
      inputPathGLB: options.inputglb,
      outputPath: options.output,
      threshold: options.threshold,
      inputPathGLTF: options.inputgltf,
      inputPathBIN: options.inputbin
}
const mem_threshold = Number(config.threshold);

if(mem_threshold == null){
  throw new Error("Memory threshold not entered")
}

// File size constants
const FILE_SIZE_LIMIT = (Number(command.opts().limit) || 2) * 1024 * 1024 * 1024; // Configurable limit in bytes
const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB chunks for streaming

const FILENAME =  config.fileName;
const IN_GLTF = config.inputPathGLTF;
const IN_BIN = config.inputPathBIN;
const IN_GLB = config.inputPathGLB;
const OUTPATH = config.outputPath;
// Use proper path joining for output file path
const OUT = path.isAbsolute(config.outputPath)
  ? path.join(config.outputPath, FILENAME)
  : path.join(process.cwd(), config.outputPath, FILENAME);



interface AttributeData {
    [key: string]: Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array;
}

interface AttributeNode {
  name: string,
  size: number,
  data : Array<AttributeData>
}

interface Manifest {
  inputFile: string,
  converterApplication: string,
  converterApplicationVersion: string,
  conversionDate: string,
  gltfOutFiles: Array<string>,
  metadataOutFiles: Array<string>,
  numGltfNodes: number,
  numGltfAccessors: number,
  numGltfAccessorsIncludingResued: number,
  numGlftVertices: number,
  numGlftVerticesIncludingReuse: number,
  numGlftTriangles: number,
  numGlftTrianglesIncludingReused: number,
  numCreatedMetaObjects:number,
  numExportedPropertySetsOrElementQuantities: number,
  modelBoundsMax: vec3,
  modelBoundsMin: vec3,
  generalMessages: Array<string>,
  warnings: Array<string>,
  errors: Array<string>,
}

// Helper function to check file size
async function checkFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    throw new Error(`Failed to get file size for ${filePath}: ${error}`);
  }
}

// Helper function to read large files using streaming
async function readLargeFile(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
    
    let totalBytes = 0;
    let lastProgressTime = Date.now();
    const fileSize = require('fs').statSync(filePath).size;
    
    console.log(`Reading large file: ${filePath} (${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
    console.log(`Using chunk size: ${(CHUNK_SIZE / (1024 * 1024)).toFixed(0)} MB`);
    
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
      
      // Log progress every 5 seconds or every 100MB, whichever comes first
      const now = Date.now();
      const shouldLog = (now - lastProgressTime > 5000) || (totalBytes % (100 * 1024 * 1024) === 0);
      
      if (shouldLog) {
        const progress = ((totalBytes / fileSize) * 100).toFixed(1);
        const speed = (totalBytes / (1024 * 1024)) / ((now - lastProgressTime) / 1000); // MB/s
        console.log(`Reading progress: ${progress}% (${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB / ${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB) - ${speed.toFixed(1)} MB/s`);
        lastProgressTime = now;
      }
    });
    
    stream.on('end', () => {
      console.log(`Finished reading file: ${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`);
      resolve(Buffer.concat(chunks));
    });
    
    stream.on('error', (error) => {
      reject(new Error(`Failed to read large file ${filePath}: ${error}`));
    });
  });
}

// Helper function to read large binary file for GLTF+BIN combination
async function readLargeBinaryFile(filePath: string): Promise<Buffer> {
  return readLargeFile(filePath);
}

// Helper function to read large GLTF file
async function readLargeGLTFFile(filePath: string): Promise<string> {
  const buffer = await readLargeFile(filePath);
  return buffer.toString('utf8');
}

async function readDoc(io: NodeIO): Promise<Document> {
  console.log('readDoc called');
  if(IN_GLB !== undefined){
    const chunks : Array<Uint8Array> = [];
    try{
      // Check file size before reading
      const fileSize = await checkFileSize(IN_GLB);
      console.log(`GLB file size: ${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
      
      if (fileSize > FILE_SIZE_LIMIT) {
        console.log(`Large file detected (>2GB), using streaming approach...`);
        const buffer = await readLargeFile(IN_GLB);
        return await io.readBinary(buffer);
      } else {
        console.log(`Small file detected (≤2GB), using direct reading...`);
        return await io.read(IN_GLB);
      }
    }catch(e){
      if(e.code === "ERR_FS_FILE_TOO_LARGE"){
        try {
          const readStream = createReadStream(IN_GLB);
          // This shows how ot use the node IO for the binary typeshttps://gltf-transform.dev/modules/core/classes/NodeIO
          readStream.on("data", function (chunk: Uint8Array) {
            chunks.push(Buffer.from(chunk,Uint8Array))
          })
          readStream.on("end", function (){
              const fileInMemory:Uint8Array= new Uint8Array; 
              chunks.forEach(chunk => fileInMemory.push(chunk));
             return io.readBinary(fileInMemory);
           })
        } catch(e) {
          throw new Error(e.code + " \n failed to load glb")
        }
      }
    }
  }else if(IN_GLTF !== undefined){
    try{
      // Check file sizes for GLTF and BIN files
      const gltfSize = await checkFileSize(IN_GLTF);
      const binSize = IN_BIN ? await checkFileSize(IN_BIN) : 0;
      const totalSize = gltfSize + binSize;
      
      console.log(`GLTF file size: ${(gltfSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
      if (IN_BIN) {
        console.log(`BIN file size: ${(binSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
      } else {
        console.log(`No BIN file provided`);
      }
      console.log(`Total size: ${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
      
      if (totalSize > FILE_SIZE_LIMIT) {
        console.log(`Large files detected (>2GB total), using streaming approach...`);
        
        // Check if GLTF file is large
        const isGLTFLarge = gltfSize > FILE_SIZE_LIMIT;
        const isBINLarge = IN_BIN && binSize > FILE_SIZE_LIMIT;
        
        let tempGLTFPath: string | null = null;
        let tempBinPath: string | null = null;
        
        try {
          // Handle large GLTF file
          if (isGLTFLarge) {
            console.log(`Reading large GLTF file using streaming...`);
            const gltfContent = await readLargeGLTFFile(IN_GLTF);
            tempGLTFPath = IN_GLTF + '.temp';
            await fs.writeFile(tempGLTFPath, gltfContent, 'utf8');
          }
          
          // Handle large BIN file (only if BIN file exists)
          if (isBINLarge && IN_BIN) {
            console.log(`Reading large BIN file using streaming...`);
            const binBuffer = await readLargeBinaryFile(IN_BIN);
            tempBinPath = IN_BIN + '.temp';
            await fs.writeFile(tempBinPath, binBuffer);
          }
          
          // Use the appropriate file paths (temp files if large, original if small)
          const gltfPath = tempGLTFPath || IN_GLTF;
          
          // Read the document using the appropriate paths
          const result = await io.read(gltfPath);
          
          // Clean up temp files
          if (tempGLTFPath) await fs.unlink(tempGLTFPath);
          if (tempBinPath) await fs.unlink(tempBinPath);
          
          return result;
        } catch (error) {
          // Clean up temp files on error
          if (tempGLTFPath) await fs.unlink(tempGLTFPath).catch(() => {});
          if (tempBinPath) await fs.unlink(tempBinPath).catch(() => {});
          throw error;
        }
      } else {
        console.log(`Small files detected (≤2GB total), using direct reading...`);
        return await io.read(IN_GLTF);
      }
    }catch(e){
      throw new Error(e + " \n failed to load gltf")
    }
  }
  throw new Error("No valid input files provided")
}

// async function readDoc(io: NodeIO):Document{
//   try{
//     if( IN_GLB == null ){
//       if(IN_BIN == null || IN_GLTF == null){

//       }
//     }else{
//       return await io.read(IN_GLB);
//     }
//   }catch(e){
//     throw new Error(e);
//   }
//   throw new Error("something unexpected happened in readDoc")
// }


(async () => {

  // Use proper path resolution to handle both absolute and relative paths
  var dir = path.isAbsolute(config.outputPath)
    ? config.outputPath
    : path.resolve(process.cwd(), config.outputPath);

  console.log("Output directory:", dir);
  console.log(`File size limit for streaming mode: ${(FILE_SIZE_LIMIT / (1024 * 1024 * 1024)).toFixed(1)} GB`);
  if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
  }
  // try {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;

    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
      });

    const document = await readDoc(io)

      // File stats
      // const symSegs = Math.ceil(fs.stat(IN).size / 80);
      // const stats = await fs.stat(IN);
      // console.log("Data here",stats.size);
      // const sysSeg = Math.floor(stats.size / Math.pow(10,6));
      // console.log("systemSegments", sysSeg);
      // const seg_count = Array(sysSeg).fill(0);

    // If there is no default scene, set the first
    // scene in the scene list to be the default scene
    if (document.getRoot().getDefaultScene()== null){
      document.getRoot().setDefaultScene(document.getRoot().listScenes()[0])
    }
    // attach loose nodes to the default scene
    const nullmesh : Array<string> = [];
    for(const node of document.getRoot().listNodes()){
      if (!document.getRoot().getDefaultScene().listChildren().includes(node)  &&
            node.getName() != "rootNode" &&
            node.getMesh() != null){
        // console.log("added ",node.getName()," to default scene");
        document.getRoot().getDefaultScene().addChild(node);
      }
      if (node.getMesh() == null ){
        nullmesh.push(node.getName());
      }else{
            // console.log(node.getMesh().getName())
          if (node.getMesh().getName() == null){
            node.getMesh().setName(node.getName())
          }
      }
    }
      // console.log("nullmesh\n",nullmesh,"\n")

      // console.log("Original Doc")
      // console.log("____________________________________________________________________________________________________ \n")
      // console.log("nodelist" ,document.getRoot().listNodes().length)
      // console.log("accessorslist" ,document.getRoot().listAccessors().length)
      // console.log("mesheslist" ,document.getRoot().listMeshes().length)
      // console.log("sceneslist" ,document.getRoot().listScenes().length)
      // console.log("cameraslist" ,document.getRoot().listCameras().length)
      // console.log("materialsList" ,document.getRoot().listMaterials().length)
    // Use to check if there are detatched elements
    // await document.transform(gtf.prune({propertyTypes: [PropertyType.MESH]})) ;
    await document.transform(gtf.prune({propertyTypes: [PropertyType.MESH,PropertyType.NODE]})) ;
    // await document.transform(gtf.dedup({propertyTypes: [PropertyType.MESH]})) ;
      // console.log("\n\n after prune\n\n__________________________________________________________________________________________________ \n")
      // console.log("nodelist" ,document.getroot().listnodes().length)
      // console.log("accessorslist" ,document.getroot().listaccessors().length)
      // console.log("mesheslist" ,document.getroot().listmeshes().length)
      // console.log("sceneslist" ,document.getroot().listscenes().length)
      // console.log("cameraslist" ,document.getroot().listcameras().length)
      // console.log("materialsList" ,document.getRoot().listMaterials().length)
    const sorted = sort_by_threshold(document ,mem_threshold);

    // console.log(sorted[0][0].getName());
    // createPartitions(document,sorted)
    const doc_list = writeNewDocuments(document,sorted,io);
    console.log("Document List:",doc_list);
    const manifest = makeManifest(IN_GLB,doc_list,document);
  // } catch (e) {
  //     throw new Error('Script failed:\n'+ e);
  //   }
  })();

//   async function createPartitions (document: Document, sorted : Array<Array<Mesh>>) {
//     console.log(document.getRoot().listBuffers())
//     const mesh_name_array: string[] = sorted[0].map((b)=> b.getName())
//     console.log(mesh_name_array)
//     await document.transform(gtf.partition({meshes: mesh_name_array}))
//     console.log(document.getRoot().listBuffers())
//   }

  async function makeManifest(input: any,doc_list: Array<string>, document: Document) {
      const { min = null, max = null } = gtf.getBounds?.(document.getRoot().getDefaultScene()) ?? {
       min: null,
       max: null
      };

      const manifest : Manifest = {
      inputFile: input,
      converterApplication: '3dssplitter',
      converterApplicationVersion: '0.0.1',
      conversionDate: "",
      gltfOutFiles: doc_list,
      metadataOutFiles: ['test.json'],
      numGltfNodes: document.getRoot().listNodes().length,
      numGltfAccessors: document.getRoot().listAccessors().length,
      numGltfAccessorsIncludingResued: document.getRoot().listAccessors().length,
      numGlftVertices: 0,
      numGlftVerticesIncludingReuse: 0,
      numGlftTriangles: 0,
      numGlftTrianglesIncludingReused: 0,
      numCreatedMetaObjects: 0,
      numExportedPropertySetsOrElementQuantities: 0,
      modelBoundsMax: max,
      modelBoundsMin: min,
      generalMessages: [],
      warnings: [],
      errors: []
    }

    await fs.writeFile(`${OUT}.manifest.json`,JSON.stringify(manifest,null,2),{flag: "w"
    }).then(()=> {
      console.log("write manifest")
    })
  }

  function writeFile(document : Document , index: number ,io: NodeIO): string{
      const filename = OUT.concat("_",String(index).concat(".glb"));
      io.write(filename,document)
      const outname = filename.split("\/")
      return outname[outname.length-1];
  }

  function writeNewDocuments(document: Document, sorted : Array<Array<Mesh>> ,io: NodeIO): Array<string>{
      const filename_list : Array<string> = [] ;
      const sourceMeshMap = new Map();
      const sourceNodeMap = new Map();
      document.getRoot().listNodes().forEach(node =>{
      if(node.getName() != "rootNode" && node.getName() != null){
        try{

        sourceNodeMap.set(node.getMesh().getName(),node)
        }catch(e){
          console.log(node.getMesh())
          throw new Error(node.getName()+"\n"+e);
        }
      }
    })
    // console.log(sorted)
    const doc_list : Array<Document> = [];
    // console.log("sorted legnth", sorted.length);
    sorted.forEach((sorted_meshes,index)=>{
      const newDoc = new Document;

      const tmpAccessor = newDoc.createAccessor()
      const scene = newDoc.createScene();
      newDoc.getRoot().setDefaultScene(scene);

     // }
    document.getRoot().listMeshes().forEach(mesh =>{
       sourceMeshMap.set(mesh.getName(),mesh)
      })


      let meshNamesToKeep : Array<string>= [];

      sorted_meshes.forEach((mesh)=>{
        meshNamesToKeep.push(mesh.getName())
      })
      // const rootNode = newDoc.createNode("rootNode");

      // for node in document.listNodes(){
      //   if !rootNode.equals(node){
      // const newNode = newDoc.createNode(node.getName())
      //
      //
      //}
      // the Idea is for each node, split the meshes the way the mesh splitter did.
      //
      // Then provide it with all of the resource that it requires for the mesh.:q

        document.getRoot().listMeshes().forEach((targetMesh) => {
          const sourceMesh = sourceMeshMap.get(targetMesh.getName());
        })

        const nodelist = [];
        for (const mesh of sorted_meshes) {
        nodelist.push(sourceNodeMap.get(mesh.getName()))
              }
        const copyResolver = gtf.createDefaultPropertyResolver(newDoc, document);

        // gtf.copyToDocument(newDoc,document,document.getRoot().listScenes())
        try{
        const map = gtf.copyToDocument(newDoc,document,nodelist)
        gtf.copyToDocument(newDoc,document,document.getRoot().listCameras(),copyResolver)
        }catch(e){
          const nodenamelist : Array<string>= [];
          for(const no of nodelist){
            if(no != undefined){
            // console.log(typeof no)
            nodenamelist.push(no);
            }
          }
          throw new Error(e)
        }
        for (const node of newDoc.getRoot().listNodes()){
          newDoc.getRoot().getDefaultScene().addChild(node);
        }
    // Split file stat logging
    // console.log("-------------------- ","file number", index, "-------------------- \n")
    //     console.log("nodelist" ,newDoc.getRoot().listNodes().length)
    //     console.log("bufferlist",newDoc.getRoot().listBuffers().length)
    //     console.log("accessorslist" ,newDoc.getRoot().listAccessors().length)
    //     console.log("mesheslist" ,newDoc.getRoot().listMeshes().length)
    //     console.log("sceneslist" ,newDoc.getRoot().listScenes().length)
    //     console.log("cameraslist" ,newDoc.getRoot().listCameras().length)
    //     console.log("materialsList" ,newDoc.getRoot().listMaterials().length)
    //   console.log("____________________________________________________________________________________________________ \n"
    //   ,"\n\n\n")
     filename_list.push(writeFile(newDoc,index,io));
    })
    // accessor.
    return filename_list;
  }





// Sort meshes into bins that are filled by MESH attribute size
// this isn't accurate because it doesn't factor in material or textures.
function sort_by_threshold(document: Document, mem_threshold: number):Array<Array<Mesh>> | null{
    let splitBin: Array<Array<Mesh>> = [];
    let bin: Array<Mesh> = [];
    const meshesWithSize: Array<{mesh: Mesh, size: number}> = [];
    let totalSize = 0;
    document.getRoot().listMeshes().forEach((mesh) => {
    let meshSize = 0;

          try{
            mesh.listPrimitives().forEach((prim) => {

              prim.listSemantics().forEach((semantics) => {
                const accessor = prim.getAttribute(semantics);
                meshSize += accessor.getByteLength();
              });

            });

            // Add mesh to the meshWithSize Array
            meshesWithSize.push({ mesh,size: meshSize});
            totalSize += meshSize;
            //if the byte size of the bin and the new mesh is less threshold, the bin should have the mesh added
            //if the mesh exceeds the total mem_threshold size, it should be placed in its own bin.
            //if the byte size of the bin and the new mesh is greated than the threshold, the old bin should be added to the
            //bin array and the new mesh should be pushed to an empty bin.
            // if( bin.reduce((total,node)=> total + size,0) + size < mem_threshold){
            //   bin.push(mesh);
            // }else if (size > mem_threshold){

            //   splitBin.push([mesh]);
            // }else{
              // splitBin.push(bin);
              // bin = [];
              // size = 0;
              // bin.push(mesh);
            // }
          }catch(e){
            throw new Error(e);
          }
    });
          // Calculate the optimal number of bins based on the threshold
          const optimalBinCount = Math.max(1,Math.ceil(totalSize / mem_threshold))
          const targetSizePerBin = totalSize / optimalBinCount;

          console.log(`Total Size: ${totalSize} bytes`)
          console.log(`Creating ${optimalBinCount} bins with target size: ${targetSizePerBin}`)

          // Order meshes by size
          meshesWithSize.sort((a,b)=> b.size - a.size);

          // Create empty bins
          const bins: Array<Array<Mesh>> = Array.from({length: optimalBinCount}, (): Array<Mesh> => []);
          const binSizes: Array<number> = Array(optimalBinCount).fill(0);

          // Use a greedy algorithm to disribute meshes across bins
          const oversizedMeshes = meshesWithSize.filter(item => item.size > targetSizePerBin);
          const normalMeshes = meshesWithSize.filter(item => item.size <= targetSizePerBin);

          // Place each oversized mesh in its own bin
          oversizedMeshes.forEach(({mesh, size}) => {
              // Select from only the set of empty bins
              const binIndex = binSizes.indexOf(Math.min(...binSizes));
              bins[binIndex].push(mesh);
              binSizes[binIndex] += size;
          });

          normalMeshes.forEach(({mesh,size})=>{

// Find the bin that has the most space available but can still fit this mesh
        const binIndex = binSizes
            .map((binSize, index) => ({ index, remainingSpace: mem_threshold - binSize }))
            .filter(bin => bin.remainingSpace >= size)
            .sort((a, b) => a.remainingSpace - b.remainingSpace)[0]?.index;
  // If we found a suitable bin, add the mesh to it
        if (binIndex !== undefined) {
            bins[binIndex].push(mesh);
            binSizes[binIndex] += size;
        } else {
            // If no bin can fit this mesh, find the emptiest bin
            const emptyBinIndex = binSizes.indexOf(Math.min(...binSizes));
            bins[emptyBinIndex].push(mesh);
            binSizes[emptyBinIndex] += size;
        }
    });
    //Remove empty bins
    const finalBins = bins.filter(bin => bin.length > 0);

    //Log final distribution
    finalBins.forEach((bin,index) => {
            const binSize = bin.reduce((total, mesh) => {
            let meshSize = 0;
            mesh.listPrimitives().forEach(prim => {
                prim.listSemantics().forEach(semantics => {
                    meshSize += prim.getAttribute(semantics).getByteLength();
                });
            });
            return total + meshSize;
        }, 0);
        console.log(`Bin ${index}: ${bin.length} meshes, total size: ${binSize} bytes (${(binSize/totalSize*100).toFixed(2)}% of total)`);
    });
    return finalBins;
}

//UNUSED
function setState(document: Document, subArray: Array<Float32Array | Int32Array | Uint32Array | null>){
  for (const mesh of document.getRoot().listMeshes()){
    // console.log(mesh.getName())
    for (const prim of mesh.listPrimitives()){
      // console.log(prim.getName())
      for (const semantic of prim.listSemantics()){
      // console.log(semantic)
        // prim.getAttribute(semantic).setArray(subArray);
      }
    }
  }
}
