# How isnet-fp16w.onnx was made from IS-Net general-use (see README.md in this folder).
#
#   pip install onnx numpy
#   curl -LO https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
#   python convert.py isnet-general-use.onnx isnet-fp16w.onnx
#
# 1. Weights are stored as float16 (half the download) with a Cast to float32 after each one:
#    ONNX Runtime folds the casts when the model loads, so it still computes in float32 everywhere
#    (outputs differ from the original by less than 0.004 on a 0–1 scale).
# 2. MaxPool ceil_mode 1 -> 0: onnxruntime-web does not support ceil_mode; with the fixed 1024×1024
#    input every pooled size is even, so the result is the same.
# 3. Only the final mask is kept as an output (the side outputs are not needed).
import sys
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph

# 1. float16 storage, float32 compute
new_inits, casts = [], []
for init in g.initializer:
    if init.data_type == TensorProto.FLOAT and np.prod(init.dims) >= 16:
        name16 = init.name + '__fp16'
        new_inits.append(numpy_helper.from_array(numpy_helper.to_array(init).astype(np.float16), name16))
        casts.append(helper.make_node('Cast', [name16], [init.name], to=TensorProto.FLOAT, name=init.name + '__cast'))
    else:
        new_inits.append(init)
del g.initializer[:]
g.initializer.extend(new_inits)
nodes = casts + list(g.node)

# 2. ceil_mode
for n in nodes:
    if n.op_type == 'MaxPool':
        for a in n.attribute:
            if a.name == 'ceil_mode':
                a.i = 0

# 3. keep only the final output, and what it needs
keep = [o for o in g.output if o.name == 'output_image']
del g.output[:]
g.output.extend(keep)
needed, kept = {'output_image'}, []
for n in reversed(nodes):
    if any(o in needed for o in n.output):
        kept.append(n)
        needed.update(i for i in n.input if i)
kept.reverse()
inits = [i for i in g.initializer if i.name in needed]
del g.node[:]
g.node.extend(kept)
del g.initializer[:]
g.initializer.extend(inits)

m.producer_name = 'morph (IS-Net general-use, fp16 weights)'
onnx.checker.check_model(m)
onnx.save(m, dst)
print('saved', dst)
