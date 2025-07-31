import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Document, Node, NodeIO, Primitive ,Mesh, vec3} from '@gltf-transform/core';
import * as gtf from '@gltf-transform/functions';
import * as fs from 'fs/promises';
import { error } from 'console';
import { write, existsSync, mkdirSync, read } from 'fs';
import { Command } from 'commander';

// const FILENAME = "msc22032"
// const IN = './msc/' + FILENAME+ ".glb";
// const OUT = './msc/output/' + FILENAME

// const FILENAME = "mrg"
// const IN = './MRG/MRG-GRM-MAI-ZZ-M3-AR-000001_ACC_FederatedModel.glb';
// const OUT = './MRG/output/' + FILENAME

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
    .parse(process.argv);


const config: Config = {
      fileName: command.opts().name,
      inputPathGLB: command.opts().inputglb,
      outputPath: command.opts().output,
      threshold: command.opts().threshold,
      inputPathGLTF: command.opts().inputgltf,
      inputPathBIN: command.opts().inputbin
}
const mem_threshold = Number(config.threshold);

if(mem_threshold == null){
  throw new Error("Memory threshold broken")
}

const FILENAME =  config.fileName;
const IN_GLTF = config.inputPathGLTF;
const IN_BIN = config.inputPathBIN;
const IN_GLB = config.inputPathGLB;
const OUTPATH = config.outputPath;
const OUT = config.outputPath + FILENAME;



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

async function readDoc(io: NodeIO):  Promise<Document>  {
  if(IN_GLB !== undefined){
    try{
      return await io.read(IN_GLB);
    }catch(e){
      throw new Error(e + " \n failed to load glb")
      process.exit(1);
    }
  }else if(IN_GLTF !== undefined && IN_BIN !== undefined ){
    try{
      return await io.read(IN_GLTF)
      // console.log(IN_GLTF);
      // const gltf = await io.readAsJSON(IN_GLTF);
      // const binfile = await fs.readFile(IN_BIN)
      // const bin = await io.readBinary(binfile);
      // const doc = io.readJSON(gltf);
      // console.log("document", doc, "\n", "bin", bin);
      // gtf.copyToDocument(doc,bin,bin.getRoot())

    }catch(e){
      throw new Error(e + " \n failed to load gltf")
      process.exit(1);
    }
  }
  throw new Error()
  process.exit(1);
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

  var dir = __dirname +"/"+ config.outputPath;
  console.log("directory",dir);
  if (!existsSync(dir)) {
      mkdirSync(dir,{ recursive : true});
  }
  try {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;

    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
      });

    const document = await readDoc(io)
    // console.log(document)
    // const symSegs = Math.ceil(fs.stat(IN).size / 80);
    // const stats = await fs.stat(IN);
    // console.log("Data here",stats.size);
    // const MSCGLTF = fs.readFile("./MSC/MSC22032_local.gltf")
    // const MSCBIN = fs.readFile("./MSC/MSC22032_local.bin")
    // const sysSeg = Math.floor(stats.size / Math.pow(10,6));
    // console.log("systemSegments", sysSeg);
    // const seg_count = Array(sysSeg).fill(0);
    // const input = IN_GLB || IN_GLTF || IN_GLB;


    // const document = await readDoc()
    // const document = await io.read(IN_GLB)
    const sorted = sort_by_threshold(document ,mem_threshold);
    console.log("Original Doc")
    console.log("____________________________________________________________________________________________________ \n")
    console.log("nodelist" ,document.getRoot().listNodes().length)
    console.log("accessorslist" ,document.getRoot().listAccessors().length)
    console.log("mesheslist" ,document.getRoot().listMeshes().length)
    console.log("sceneslist" ,document.getRoot().listScenes().length)
    console.log("cameraslist" ,document.getRoot().listCameras().length)
    console.log("materialsList" ,document.getRoot().listMaterials().length)
    // console.log(sorted[0][0].getName());
    // createPartitions(document,sorted)
    const doc_list = writeNewDocuments(document,sorted,io);
    console.log("doclist",doc_list);
    const manifest = makeManifest(IN_GLB,doc_list,document);
  } catch (error) {
      console.error('Script failed:', error);
      process.exit(1);
    }
  })();

//   async function createPartitions (document: Document, sorted : Array<Array<Mesh>>) {
//     console.log(document.getRoot().listBuffers())
//     const mesh_name_array: string[] = sorted[0].map((b)=> b.getName())
//     console.log(mesh_name_array)
//     await document.transform(gtf.partition({meshes: mesh_name_array}))
//     console.log(document.getRoot().listBuffers())
//   }

  async function makeManifest(input: any,doc_list: Array<string>, document: Document) {
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
      modelBoundsMax: gtf.getBounds(document.getRoot().getDefaultScene()).max,
      modelBoundsMin: gtf.getBounds(document.getRoot().getDefaultScene()).min,
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
          // console.log(node.getMesh().getName())
        sourceNodeMap.set(node.getMesh().getName(),node)
        }catch(e){
          console.log(e)
        }
      }
    })
    // console.log(sorted)
    const doc_list : Array<Document> = [];
    console.log("sorted legnth", sorted.length);
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
        const map = gtf.copyToDocument(newDoc,document,nodelist)
        gtf.copyToDocument(newDoc,document,document.getRoot().listCameras(),copyResolver)
        for (const node of newDoc.getRoot().listNodes()){
          newDoc.getRoot().getDefaultScene().addChild(node);
        }
        // gtf.copyToDocument(newDoc,document,document.getRoot().listAccessors(),copyResolver)
        // newDoc.transform(gtf.prune());
        // console.log(newDoc.getRoot().listBuffers().length);
        // newDoc.transform(gtf.unpartition());
        console.log(newDoc.getRoot().listBuffers().length);

        // console.log("document root name ",newDoc.getRoot().getName())
        // newDoc.getRoot().setName("rootNode")
        // console.log("document root name ",newDoc.getRoot().getName())


    console.log("-------------------- ","file number", index, "-------------------- \n")
        console.log("nodelist" ,newDoc.getRoot().listNodes().length)
        console.log("bufferlist",newDoc.getRoot().listBuffers().length)
        console.log("accessorslist" ,newDoc.getRoot().listAccessors().length)
        console.log("mesheslist" ,newDoc.getRoot().listMeshes().length)
        console.log("sceneslist" ,newDoc.getRoot().listScenes().length)
        console.log("cameraslist" ,newDoc.getRoot().listCameras().length)
        console.log("materialsList" ,newDoc.getRoot().listMaterials().length)
      console.log("____________________________________________________________________________________________________ \n"
      ,"\n\n\n")
     filename_list.push(writeFile(newDoc,index,io));
    })
    // accessor.
    return filename_list;
  }






function sort_by_threshold(document: Document, mem_threshold: number):Array<Array<Mesh>> | null{
    let splitBin: Array<Array<Mesh>> = [];
    let bin: Array<Mesh> = [];
    document.getRoot().listMeshes().forEach((mesh) => {
    let size = 0;
        // console.log("name",child.getName());
        // console.log("child",child.getMesh().listPrimitives())
          try{
            mesh.listPrimitives().forEach((prim) => {
              // console.log(" semantics",prim.listSemantics())
              // console.log(" Count", prim.getAttribute("POSITION").getCount());

              prim.listSemantics().forEach((semantics) => {
                const accessor = prim.getAttribute(semantics);
                size = size + accessor.getByteLength();
                const array = accessor.getArray() as Float32Array | Int32Array | Uint32Array | null;

                // console.log("  i bytelength", accessor.getByteLength());

              })

            })
            if( bin.reduce((total,node)=> total + size,0) + size < mem_threshold){
              // console.log("I should trigger the most", size);
              bin.push(mesh);
            }else if (size > mem_threshold){
              // console.log("I should almost never trigger");

              splitBin.push([mesh]);
            }else{
              // console.log("I shuold trigger infrequently");
              splitBin.push(bin);
              bin = [];
              size = 0;
              bin.push(mesh);
            }
          }catch(e){
            console.error(e);
          }
        })
        splitBin.push(bin);
  return splitBin;
}

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

// function binDimSplit(bbox,axis, document, scene){
//   const mid = (bbox.max[axis] - bbox.min[axis]) / 2 + bbox.min[axis];
//   let size_sum = 0;
//   const prim_array = [];
//     scene.listChildren().forEach((rootNode)=> {
//       let count = {left: 0 , right:0};
//       rootNode.listChildren().forEach((child) =>{
//           console.log("name",child.getName());
//         try{

//       let max;
//       let min;
//       child.getMesh().listPrimitives().forEach((prim) =>{
//         // const splitPrim = map.get(prim);


//           console.log("  semantics", prim.listSemantics());
//         if (prim.getAttribute("POSITION") != null){
//           console.log("  Count", prim.getAttribute("POSITION").getCount());
//           // weight assessment here
//           prim.listAttributes().forEach((accessor)=>{
//             console.log("  i bytelength", accessor.getByteLength());
//             size_sum = size_sum + accessor.getByteLength();
//           });

//           for (let i = 0; i < prim.getAttribute("POSITION").getCount() ; i++){
//             const element = prim.getAttribute("POSITION").getElement(i,[]);
//             if(i ==0){
//               max = element[axis];
//               min = element[axis];
//             }else{
//               if (max < element[axis]) max = element[axis];
//               if (min > element[axis]) min = element[axis];
//             }
//               }
//             }
//         console.log("   max",max, " min",min);
//           });
//         if (min > mid && max > mid ){
//           console.log("trigger")
//           count.right = count.right + 1;
//         }else{
//           console.log("trigger")
//           count.left = count.left + 1;
//         }
//         }catch(e){
//           console.error(e);
//         }
//         console.log("   count",count.left + count.right);
//         });
//       });
//   console.log("       size_sum",size_sum)
// }

    // document.getRoot()
    //   .listScenes()
    //   .forEach((scene) => {
    //     const bounds = gtf.bounds(scene);
    //     console.log('scene', bounds);
    //     console.log("sorted length",sorted.length);

        // scene.listChildren()
          // .forEach((child) => {
          //   try{
          //   child.listChildren().forEach((childer) => {
          //   // console.log(child.getName());
          //   childer.getMesh().listPrimitives().forEach((prim) => {
          //       for (const semantic of prim.listSemantics()){
          //         const attribute = prim.getAttribute(semantic);
          //         tmpAccessor.copy(attribute);
          //         split_Primitive.lhs[semantic] = Array(leftCount * attribute.getElementSize());
          //         split_Primitive.rhs[semantic] = Array(rightCount * attribute.getElementSize());
          //         console.log(semantic);
          //       // console.log(prim.getAttribute('POSITION').getCount());

          //     });
          //   });
          //   }
          //   catch(e){
          //     console.log(e.message);
          //   }
          // });
        //
                // newDoc.transform(gtf.unpartition())
                // console.log("Original Doc")

              // }
              // }


            // }
              //

              // console.log(emptyDoc.getRoot().listNodes());
                // newFile.forEach((subMesh) =>{
                //   newNode.setMesh(subMesh.clone());
              // console.log(subMesh)
              // })
              // console.log("new node", newNode)

                // console.log("newdoc meshes length initial",
                            // newDoc.getRoot().listMeshes().length)
                // document.getRoot().listMeshes().forEach((targetMesh) => {
                  // const sourceMesh = sourceMeshMap.get(targetMesh.getName());

                // let node_checker = (arr : Array<Node>, target : Array<Node>) => target.every(v => arr.includes(v));
                // if (sourceMesh && meshNamesToKeep.includes(targetMesh.getName())){
                  // assume that targetParentNodes is always length 1
                  // const targetParentNodes = targetMesh.listParents().filter((p)=> p instanceof Node)
                  // console.log("--------------------------------------------------"
                  // ,targetParentNodes.length);
                  // if (node_checker(targetParentNodes,scene.listChildren()) && targetParentNodes.length == 1){
                    // const newNode = newDoc.createNode(targetParentNodes[0].getName());
                    // // scene.addChild(newNode)
                    // const newMesh = newDoc.createMesh(targetMesh.getName());
                    // // newNode.setMesh(targetMesh);
                    // const primatives = targetMesh.listPrimitives()
                    // targetMesh.listPrimitives().forEach((prim)=>{
                      // for ( const semantic of prim.listSemantics()){
                          // tmpAccessor.copy(prim.getAttribute(semantic))
                      // }
                    //   const newPrim = newDoc.createPrimitive()
                    //   .setAttribute("POSITION",prim.getAttribute('POSITION'))
                    //   .setAttribute("TEXTCOORD_0",prim.getAttribute("TEXTCOORD_0"));
                    //   newMesh.addPrimitive(prim);

                  // });
                  // newNode.setMesh(newMesh);
                  // const newMesh = newDoc.createMesh(targetMesh.getName());
                  // newMesh.copy(targetMesh)
                // }else{
                  // console.log("included",targetMesh.getName())
                // }
                // newFile.forEach((mesh) =>{
                //   // console.log("oldmesh",mesh)
                //   newDoc.getRoot().listMeshes().forEach((newMesh)=>{
                //     if(newMesh != mesh){
                //       newMesh.dispose()
                //     }else{
                //       // console.log("mesh ",mesh.getName())
                //     }
                //   })
                // })
                // console.log(mesh.getName())
                // }
              // })
                //
