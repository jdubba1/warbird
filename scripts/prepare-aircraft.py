"""Prepare AnirudhRao's CC BY 4.0 MH-6 for the unlit aircraft pass.

Usage: python prepare-aircraft.py source.glb dist/assets/little-bird.js
Requires numpy, trimesh, networkx and fast-simplification. CPU only.
Source: https://sketchfab.com/3d-models/d6ec6eeb84b240789f54923bdedafc86
Public mirror: https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-030/d6ec6eeb84b240789f54923bdedafc86.glb
"""
import json
import math
from pathlib import Path
import sys

import numpy as np
import trimesh


def prepare(source, output):
    scene = trimesh.load(source, force='scene', process=False)
    # Undo the presentation tilt, face -Z, and remove the CAD export offset.
    tilt = math.atan2(scene.graph['Sketchfab_model'][0][1, 0], scene.graph['Sketchfab_model'][0][0, 0])
    rotation = trimesh.transformations.rotation_matrix(-tilt, [0, 0, 1])
    rotation = trimesh.transformations.rotation_matrix(math.pi, [0, 1, 0]) @ rotation
    pivot = scene.graph['rotor'][0][:3, 3]
    transform = rotation.copy()
    transform[:3, 3] = -rotation[:3, :3] @ pivot
    meshes = []
    for name in scene.graph.nodes_geometry:
        matrix, geometry = scene.graph[name]
        mesh = scene.geometry[geometry].copy()
        mesh.apply_transform(transform @ matrix)
        meshes.append((name, mesh))
    rotor_vertices = np.concatenate([m.vertices for n, m in meshes if n.startswith('rotor_')])
    # MD 500-family rotor diameter, about 8.05 m. Keep the collision skid height.
    # https://www.mdhelicopters.com/wp-content/uploads/2023/04/500E-Brochure.pdf
    scale = 4.025 / np.max(np.linalg.norm(rotor_vertices[:, [0, 2]], axis=1))
    ground = min(m.bounds[0, 1] for _, m in meshes) * scale
    offset = np.array([0, -.9 - ground, .25])
    for _, mesh in meshes:
        mesh.vertices = mesh.vertices * scale + offset
        # Weld sub-centimetre CAD seams; normals/UVs are discarded in our flat fill.
        mesh.merge_vertices(merge_tex=True, merge_norm=True, digits_vertex=2)
        mesh.update_faces(mesh.nondegenerate_faces())
        mesh.update_faces(mesh.unique_faces())
    pivots = {'rotor': offset.tolist(), 'tail': (trimesh.transform_points(scene.graph['tail rotor'][0][:3, 3][None], transform)[0] * scale + offset).tolist()}
    buckets = {}

    def add(mesh, parent, color, count):
        count = min(len(mesh.faces), max(48, count))
        if count < len(mesh.faces):
            mesh = mesh.simplify_quadric_decimation(face_count=count, aggression=7)
        if parent in pivots:
            mesh.vertices -= pivots[parent]
        buckets.setdefault((parent, color), []).append(mesh)

    body = trimesh.util.concatenate([m for n, m in meshes if n.startswith('Part1')])
    body.merge_vertices(merge_tex=True, merge_norm=True, digits_vertex=2)
    for part in body.split(only_watertight=False):
        if len(part.faces) < 8:
            continue  # Disconnected CAD fragments, below a visible pixel.
        gear = part.bounds[1, 1] < offset[1] - 1.2 * scale
        add(part, 'body', 'ink' if gear else 'body', round(len(part.faces) * .029))
    for name, mesh in meshes:
        if name.startswith('Part1'):
            continue
        if name.startswith('rotor_'):
            add(mesh, 'rotor', 'ink', round(len(mesh.faces) * .01))
        elif name.startswith('tail rotor_'):
            add(mesh, 'tail', 'ink', round(len(mesh.faces) * .035))
        elif name.startswith('glass_'):
            add(mesh, 'body', 'glass', 2200)
        elif name.startswith('pilot seat'):
            add(mesh, 'body', 'ink', 350)
        else:
            add(mesh, 'body', 'accent', 80)
    result = {'pivots': pivots, 'meshes': []}
    for (parent, color), parts in buckets.items():
        mesh = trimesh.util.concatenate(parts)
        result['meshes'].append({'parent': parent, 'color': color,
            'positions': np.round(mesh.vertices, 4).flatten().tolist(),
            'indices': mesh.faces.flatten().tolist()})
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('// MH-6 Little Bird by AnirudhRao, CC BY 4.0. See aircraft-license.txt.\n'
                    '// Simplified geometry, oriented/scaled for Warbird. No textures or shading.\n'
                    'export default ' + json.dumps(result, separators=(',', ':')) + ';\n')
    print(f'{sum(len(m["indices"]) // 3 for m in result["meshes"])} triangles, {len(result["meshes"])} meshes, {path.stat().st_size} bytes')
    print('pivots', pivots, 'scale', scale)


if __name__ == '__main__':
    prepare(*sys.argv[1:])
