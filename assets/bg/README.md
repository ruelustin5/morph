# Background removal model

`isnet-fp16w.onnx` removes the background of pictures, in the browser (nothing is uploaded).
The web version serves it from the same site (`bg/`), with ONNX Runtime Web, the first time someone
uses **Remove background**; the browser keeps it afterwards.

- **Model:** IS-Net "general use", from *Highly Accurate Dichotomous Image Segmentation*
  (Xuebin Qin, Hang Dai, Xiaobin Hu, Deng-Ping Fan, Ling Shao, Luc Van Gool, ECCV 2022),
  https://github.com/xuebinqin/DIS — licensed under the Apache License 2.0 (`LICENSE-Apache-2.0.txt`).
- **File used:** the ONNX export distributed by rembg,
  https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
  (sha256 `60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a`).
- **Changes made** (`convert.py`): weights stored as float16 with casts back to float32, MaxPool
  `ceil_mode` set to 0 (same result for the 1024×1024 input), side outputs removed. Result:
  sha256 `ff813f1a10d66c642e31167f51204d99daebec7a46c774eb94e82a94d1d6d906`, 90 MB.
- **Input:** `input_image`, float32 `[1, 3, 1024, 1024]`, RGB scaled to 0–1 minus 0.5.
  **Output:** `output_image`, float32 `[1, 1, 1024, 1024]`, 0–1 (1 = keep).
