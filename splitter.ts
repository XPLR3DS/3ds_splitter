import { bbox, Document, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { bounds, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

// Constants and interfaces.

const SPLIT_AXIS = 1;

const IN = './MSC/MSC22032.glb';
const OUT_LHS = './MSC/MSC22032-LHS.glb';
const OUT_RHS = './MSC/MSC22032-RHS.glb';

interface AttributeData {
    [key: string]: Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array;
}

interface SplitPrimitive {
    lhs: AttributeData;
    rhs: AttributeData;
}

// Main process.

(async () => {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;

    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            'meshopt.decoder': MeshoptDecoder,
            'meshopt.encoder': MeshoptEncoder,
        });

    console.log('loading scene...');
    const document = io.read(IN);
    const scene = document.getRoot().getDefaultScene();
    const bbox = bounds(scene);

    console.log('computing LHS and RHS...');
    const accessor = document.createAccessor();
    console.log(accessor.getComponentSize());
    const splitPrims = new Map<Primitive, SplitPrimitive>();
    for (const mesh of document.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            splitPrims.set(prim, createSplitPrimitive(prim, bbox, document));
        }
    }

    console.log('writing LHS...');
    setState(document, splitPrims, 'lhs');
    console.log("out lhs",OUT_LHS);
    io.write(OUT_LHS, document);

    console.log('writing RHS...');
    setState(document, splitPrims, 'rhs');
    console.log("out rhs",document);
    io.write(OUT_RHS, document);

    console.log('🍻  Done!')
})();

// Splits a primitive in half.

function createSplitPrimitive(prim: Primitive, bbox: bbox, document: Document): SplitPrimitive {
    const mid = (bbox.max[SPLIT_AXIS] - bbox.min[SPLIT_AXIS]) / 2 + bbox.min[SPLIT_AXIS];
    const position = prim.getAttribute('POSITION');
    const positionEl = [];
    const attributeEl = [];

    // Count vertices in LHS so we can allocate space.
    let leftCount = 0;
    for (let i = 0, il = position.getCount(); i < il; i++) {
        position.getElement(i, positionEl);
        if (positionEl[SPLIT_AXIS] < mid) leftCount++;
    }
    const rightCount = position.getCount() - leftCount;
    console.log("left count", leftCount, "\n right count", rightCount);
    const tmpAccessor = document.createAccessor();
    const splitPrim = {lhs: {}, rhs: {}} as SplitPrimitive;

    // For each attribute element, write to LHS or RHS.
    for (const semantic of prim.listSemantics()) {
        const attribute = prim.getAttribute(semantic);
        tmpAccessor.copy(attribute);

        const TypedArrayConstructor = attribute.getArray().constructor as Float32ArrayConstructor;
        // console.log("typed constructor size",leftCount*attribute.getElementSize());
        splitPrim.lhs[semantic] = new TypedArrayConstructor(leftCount * attribute.getElementSize());
        splitPrim.rhs[semantic] = new TypedArrayConstructor(rightCount * attribute.getElementSize());

        let nextLeftIndex = 0;
        let nextRightIndex = 0;
        for (let i = 0, il = position.getCount(); i < il; i++) {
            position.getElement(i, positionEl);
            attribute.getElement(i, attributeEl);
            const maxLeftIndex = splitPrim.lhs[semantic].length;
            if (positionEl[SPLIT_AXIS] < mid) {
                if(nextLeftIndex >= maxLeftIndex) {
                  console.warn('Attempting to exceed left side vertex count');
                  return
                }
                tmpAccessor
                    .setArray(splitPrim.lhs[semantic] as any)
                    .setElement(nextLeftIndex++, attributeEl);
            } else {
              const maxRightIndex = splitPrim.rhs[semantic].length;
              if (nextRightIndex >= maxRightIndex){
                  console.warn('Attempting to exceed right side vertex count');
                  return
              }
                tmpAccessor
                    .setArray(splitPrim.rhs[semantic] as any)
                    .setElement(nextRightIndex++, attributeEl);
            }
        }
    }

    // Clean up.
    // tmpAccessor.dispose();

    return splitPrim;
}

// Set Document to LHS or RHS state.

function setState(document: Document, map: Map<Primitive, SplitPrimitive>, state: string) {
    for (const mesh of document.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            const splitPrim = map.get(prim);
            const primState = splitPrim[state];
            for (const semantic of prim.listSemantics()) {
                prim.getAttribute(semantic).setArray(primState[semantic]);
            }
        }
    }
}
