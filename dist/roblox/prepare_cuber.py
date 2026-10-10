#!/usr/bin/env python3
"""Prepare a Cuber v2 asset ZIP for native Roblox Parts. Python 3, no dependencies."""
import argparse
import json
import math
import zipfile
from pathlib import Path

# SurfaceGui image-right and image-down directions in Part-local coordinates.
SURFACES = {
    (-1, 0, 0): ('Left', (0, 0, 1), (0, -1, 0)),
    (1, 0, 0): ('Right', (0, 0, -1), (0, -1, 0)),
    (0, 1, 0): ('Top', (1, 0, 0), (0, 0, 1)),
    (0, -1, 0): ('Bottom', (1, 0, 0), (0, 0, -1)),
    (0, 0, -1): ('Front', (-1, 0, 0), (0, -1, 0)),
    (0, 0, 1): ('Back', (1, 0, 0), (0, -1, 0)),
}


def lua_string(value):
    equals = '='
    while ']' + equals + ']' in value:
        equals += '='
    return '[' + equals + '[' + value + ']' + equals + ']'


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def direction(a, b):
    delta = [y-x for x, y in zip(a, b)]
    length = math.sqrt(dot(delta, delta))
    if length < 1e-9:
        raise ValueError('Degenerate box face')
    return [v/length for v in delta]


def face_data(mesh, index, width, height):
    start = index * 4
    positions = mesh['positions'][start:start+4]
    normals = mesh['normals'][start:start+4]
    uv = mesh['uvs'][start:start+4]
    if len(positions) != 4 or len(uv) != 4 or len(normals) != 4:
        raise ValueError('Expected six four-vertex box faces')
    normal = tuple(round(v) for v in normals[0])
    if normal not in SURFACES or any(sum(abs(v-n) for v, n in zip(row, normal)) > 1e-5 for row in normals):
        raise ValueError('Expected axis-aligned local box normals')
    face, right, down = SURFACES[normal]
    xs = [v[0]*width for v in uv]
    ys = [(1-v[1])*height for v in uv]
    left, top, right_px, bottom = min(xs), min(ys), max(xs), max(ys)
    if left < -1e-3 or top < -1e-3 or right_px > width+1e-3 or bottom > height+1e-3:
        raise ValueError('UV outside atlas')
    # Current Cuber box faces use TL, TR, BL, BR vertices in image space.
    expected = [(left, top), (right_px, top), (left, bottom), (right_px, bottom)]
    if any(abs(x-ex)+abs(y-ey) > 1e-3 for x, y, (ex, ey) in zip(xs, ys, expected)):
        raise ValueError('Unsupported rotated/mirrored UV layout; keep the original Cuber export')
    image_right = direction(positions[0], positions[1])
    image_down = direction(positions[0], positions[2])
    x, y = dot(image_right, right), dot(image_right, down)
    rotation = round(math.degrees(math.atan2(y, x))) % 360
    if rotation not in (0, 180) or dot(image_down, down) * x < .999:
        raise ValueError('Unsupported face orientation')
    # Remove the subpixel UV inset; keep at least one pixel for very thin parts.
    x0, y0 = max(0, int(math.floor(left+1e-3))), max(0, int(math.floor(top+1e-3)))
    x1, y1 = min(width, int(math.ceil(right_px-1e-3))), min(height, int(math.ceil(bottom-1e-3)))
    return {'face': face, 'rect': [x0, y0, max(1, x1-x0), max(1, y1-y0)], 'rotation': rotation}


def prepare(source, destination):
    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        if len(entries) > 512 or sum(f.file_size for f in entries) > 64*1024*1024:
            raise ValueError('Asset ZIP is too large')
        if len({f.filename for f in entries}) != len(entries):
            raise ValueError('Duplicate filenames in ZIP')
        asset = json.loads(archive.read('asset.json'))
        if asset.get('format') != 'cube-studio-asset' or asset.get('version') != 2:
            raise ValueError('Use a Cuber v2 asset ZIP; re-export older projects in Cuber')
        coords = asset.get('coordinates', {})
        if coords.get('up') != '+Y' or coords.get('forward') != '-Z' or coords.get('conversionApplied') is not True:
            raise ValueError('Expected already-converted Roblox coordinates')
        texture = asset['texture']
        width, height = texture['width'], texture['height']
        if width != height or width not in (128, 256, 512, 1024, 2048, 4096):
            raise ValueError('Unsupported atlas dimensions')
        parts = []
        seen = set()
        if not 1 <= len(asset['parts']) <= 128:
            raise ValueError('Expected 1 to 128 Parts')
        for original in asset['parts']:
            if original.get('shape') != 'box' or original['id'] in seen:
                raise ValueError('Expected uniquely identified box Parts')
            seen.add(original['id'])
            part = {k: original[k] for k in ['id', 'name', 'size', 'restTransform', 'baseColor']}
            part['faces'] = [face_data(original['mesh'], i, width, height) for i in range(6)]
            parts.append(part)
        animations = {}
        for animation in asset.get('animations', []):
            name = animation['name']
            if name in animations:
                name = f'{name} [{animation["id"]}]'
            while name in animations:
                name += '_'
            frames = []
            for frame in animation['keyframes']:
                pose = {str(key): value['position'] + value['rotation'] for key, value in frame['jointTransforms'].items()}
                frames.append({'t': frame['time'], 'p': pose, 'paint': frame.get('paintFrame', 0)})
            animations[name] = {'frames': frames, 'duration': frames[-1]['t'] if frames else 0,
                                'loop': animation.get('loop', True), 'events': animation.get('events', [])}
        images = {'atlas': 'atlas.png', 'paintFrames': {}}
        blobs = {'atlas.png': archive.read(texture['file'])}
        for index, frame in enumerate((asset.get('paintLayer') or {}).get('frames', [])):
            if frame.get('file'):
                name = f'paint-frame-{index}.png'
                blobs[name] = archive.read(frame['file'])
                images['paintFrames'][str(index)] = name
        prepared = {'version': 1, 'name': asset.get('name', Path(source).stem),
                    'rigRoot': asset['rigRoot'], 'parts': parts,
                    'joints': [{k: joint[k] for k in ['id', 'parentPartId', 'childPartId', 'c0', 'c1']} for joint in asset['joints']],
                    'animations': animations, 'images': images}
        text = json.dumps(prepared, separators=(',', ':'), allow_nan=False)
        destination.mkdir(parents=True, exist_ok=True)
        (destination / 'PreparedAsset.lua').write_text('return game:GetService("HttpService"):JSONDecode(' + lua_string(text) + ')\n', encoding='utf-8')
        (destination / 'ImageFiles.json').write_text(json.dumps(images, indent=2)+'\n', encoding='utf-8')
        for name, content in blobs.items():
            (destination / name).write_bytes(content)
    print(f'Prepared {prepared["name"]}: {len(parts)} Parts, {len(animations)} animations. Output: {destination}')
    print('Animations: ' + ', '.join(animations))
    print('Upload the PNGs listed in ImageFiles.json; preparation does not upload anything.')
    return prepared


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('zip', type=Path)
    parser.add_argument('--out', type=Path, default=Path('prepared-asset'))
    args = parser.parse_args()
    try:
        prepare(args.zip, args.out)
    except (ValueError, KeyError, zipfile.BadZipFile) as error:
        parser.exit(1, f'Cannot prepare Cuber asset: {error}\n')
