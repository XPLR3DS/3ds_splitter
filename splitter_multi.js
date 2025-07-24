"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var meshoptimizer_1 = require("meshoptimizer");
var extensions_1 = require("@gltf-transform/extensions");
var core_1 = require("@gltf-transform/core");
var fs = require("fs/promises");
var IN = './MSC/MSC22032.glb';
// const IN = './MRG-GRM-MAI-ZZ-M3-AR-000001_adminY7WXE_EXP3DVAX.glb';
var OUT_LHS = './MSC/MSC22032-LHS.glb';
var OUT_RHS = './MSC/MSC22032-RHS.glb';
var mem_threshold = 40000000;
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var io, stats, sysSeg, seg_count, document_1, sorted, _i, sorted_1, _a, index, element, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 4, , 5]);
                return [4 /*yield*/, meshoptimizer_1.MeshoptDecoder.ready];
            case 1:
                _b.sent();
                return [4 /*yield*/, meshoptimizer_1.MeshoptEncoder.ready];
            case 2:
                _b.sent();
                io = new core_1.NodeIO()
                    .registerExtensions(extensions_1.ALL_EXTENSIONS)
                    .registerDependencies({
                    'meshopt.decoder': meshoptimizer_1.MeshoptDecoder,
                    'meshopt.encoder': meshoptimizer_1.MeshoptEncoder,
                });
                return [4 /*yield*/, fs.stat(IN)];
            case 3:
                stats = _b.sent();
                sysSeg = Math.floor(stats.size / Math.pow(10, 6));
                seg_count = Array(sysSeg).fill(0);
                document_1 = io.read(IN);
                sorted = sort_by_threshold(document_1, mem_threshold);
                for (_i = 0, sorted_1 = sorted; _i < sorted_1.length; _i++) {
                    _a = sorted_1[_i], index = _a[0], element = _a[1];
                    console.log("index ", index, " element", element);
                    // const filename = IN.concat("_",index);
                    // const tmpClone = gtf.cloneDocument(document);
                    // setState(document,element.arraybuff)
                    // io.write(filename,document)
                }
                return [3 /*break*/, 5];
            case 4:
                error_1 = _b.sent();
                console.error('Script failed:', error_1);
                process.exit(1);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); })();
function sort_by_threshold(document, mem_threshold) {
    document.getRoot().listScenes().forEach(function (scene) {
        var splitBin = [];
        scene.listChildren().forEach(function (rootNode) {
            var bin = [];
            rootNode.listChildren().forEach(function (child) {
                // console.log("name",child.getName());
                try {
                    child.getMesh().listPrimitives().forEach(function (prim) {
                        // console.log(" semantics",prim.listSemantics())
                        // console.log(" Count", prim.getAttribute("POSITION").getCount());
                        var attNode = {
                            name: child.getName(),
                            size: 0,
                            data: [],
                        };
                        prim.listAttributes().forEach(function (accessor) {
                            attNode.size = attNode.size + accessor.getByteLength();
                            var array = accessor.getArray();
                            attNode.data.push(array);
                            // console.log("  i bytelength", accessor.getByteLength());
                            if (bin.reduce(function (total, node) { return total + node.size; }, 0) + attNode.size < mem_threshold) {
                                bin.push(attNode);
                            }
                            else if (attNode.size > mem_threshold) {
                                splitBin.push([attNode]);
                            }
                            else {
                                splitBin.push(bin);
                                bin = [];
                                bin.push(attNode);
                            }
                        });
                    });
                    splitBin.push(bin);
                }
                catch (e) {
                    console.error(e);
                }
            });
        });
        return splitBin;
    });
    var error = new Error("something unexpected happened in sort_by_threshold");
    throw error;
    return null;
}
function setState(document, subArray) {
    for (var _i = 0, _a = document.getRoot().listMeshes(); _i < _a.length; _i++) {
        var mesh = _a[_i];
        console.log(mesh.getName());
        for (var _b = 0, _c = mesh.listPrimitives(); _b < _c.length; _b++) {
            var prim = _c[_b];
            console.log(prim.getName());
            for (var _d = 0, _e = prim.listSemantics(); _d < _e.length; _d++) {
                var semantic = _e[_d];
                console.log(semantic);
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
