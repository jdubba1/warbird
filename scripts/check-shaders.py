"""Optional GLSL compile check. Uses glslc, never starts a browser or GPU."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import tempfile

compiler = shutil.which('glslc')
if not compiler:
    raise SystemExit('glslc unavailable; browser shader compilation is still required.')
root = Path(__file__).resolve().parents[1]
source = (root / 'dist/rendering.js').read_text()
three = (root / 'dist/vendor/three.module.js').read_text()

def chunk(name):
    return json.loads(re.search(r'var ' + name + r' = ("(?:[^"\\]|\\.)*");', three).group(1))

with tempfile.TemporaryDirectory(prefix='rotor-sketch-glsl-') as folder:
    folder = Path(folder)
    for name, stage in [('sceneVertex','vert'),('sceneFragment','frag'),('paperVertex','vert'),('paperFragment','frag'),('aircraftFragment','frag')]:
        body = re.search(r'const ' + name + r'=`([\s\S]*?)`;', source).group(1)
        body = body.replace('GROUND_FEATURES', re.search(r'const groundFeatures=`([\s\S]*?)`;', source).group(1))
        body = body.replace('#include <colorspace_fragment>', chunk('colorspace_fragment'))
        body = body.replace('varying ', 'out ' if stage == 'vert' else 'in ')
        body = body.replace('texture2D(', 'texture(').replace('gl_FragColor', 'fragmentColor')
        prefix = '#version 450\n'
        if stage == 'vert':
            prefix += 'in vec3 position;in vec2 uv;\n'
            if name=='sceneVertex':
                prefix += 'in vec3 normal;uniform mat3 normalMatrix;uniform mat4 modelMatrix;uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;\n#ifdef USE_INSTANCING\nin mat4 instanceMatrix;\n#endif\n'
        else:
            prefix += ('out vec4 fragmentColor;\n' + chunk('colorspace_pars_fragment')
                       + '\nvec4 linearToOutputTexel(vec4 value){return sRGBTransferOETF(value);}\n')
        shader = folder / (name + '.' + stage)
        shader.write_text(prefix + body)
        variants=[[],['-DUSE_INSTANCING=1']] if name=='sceneVertex' else [[]]
        for flags in variants:
            subprocess.run([compiler, '--target-env=opengl', '-fauto-map-locations',
                        '-fauto-bind-uniforms', *flags, '-c', str(shader),
                        '-o', str(folder / (name + '.spv'))], check=True)
            print(name + (' (instanced)' if flags else '') + ': compiled')
