"""Optional import check using the Autodesk library shipped with macOS Studio.

FBX_SDK_LIBRARY=/Applications/RobloxStudio.app/Contents/MacOS/libfbxsdk.dylib
Runs in its own process; never opens Studio or changes a game.
"""
import ctypes as c
import json
import os
import sys

sdk = c.CDLL(os.environ['FBX_SDK_LIBRARY'])
ptr, string, integer, boolean = c.c_void_p, c.c_char_p, c.c_int, c.c_bool

def function(symbol, result, args):
    f = getattr(sdk, symbol)
    f.restype, f.argtypes = result, args
    return f

manager = function('_ZN6fbxsdk10FbxManager6CreateEv', ptr, [])()
try:
    importer = function('_ZN6fbxsdk11FbxImporter6CreateEPNS_10FbxManagerEPKc', ptr, [ptr, string])(manager, b'Validation')
    scene = function('_ZN6fbxsdk8FbxScene6CreateEPNS_10FbxManagerEPKc', ptr, [ptr, string])(manager, b'Test')
    initialized = function('_ZN6fbxsdk11FbxImporter10InitializeEPKciPNS_13FbxIOSettingsE', boolean, [ptr, string, integer, ptr])(importer, os.fsencode(sys.argv[1]), -1, None)
    imported = initialized and function('_ZN6fbxsdk11FbxImporter6ImportEPNS_11FbxDocumentEb', boolean, [ptr, ptr, boolean])(importer, scene, False)
    count = function('_ZNK6fbxsdk8FbxScene16GetGeometryCountEv', integer, [ptr])(scene)
    meshes = []
    for i in range(count):
        mesh = function('_ZN6fbxsdk8FbxScene11GetGeometryEi', ptr, [ptr, integer])(scene, i)
        meshes.append({
            'uvLayers': function('_ZNK6fbxsdk7FbxMesh15GetUVLayerCountEv', integer, [ptr])(mesh),
            'deformers': function('_ZNK6fbxsdk11FbxGeometry16GetDeformerCountEv', integer, [ptr])(mesh),
        })
    result = {'initialized': bool(initialized), 'imported': bool(imported), 'meshes': meshes,
              'textures': function('_ZNK6fbxsdk8FbxScene15GetTextureCountEv', integer, [ptr])(scene),
              'materials': function('_ZNK6fbxsdk8FbxScene16GetMaterialCountEv', integer, [ptr])(scene),
              'animations': function('_ZN6fbxsdk11FbxImporter17GetAnimStackCountEv', integer, [ptr])(importer)}
    result['textureFiles'] = []
    for i in range(result['textures']):
        texture = function('_ZN6fbxsdk8FbxScene10GetTextureEi', ptr, [ptr, integer])(scene, i)
        filename = function('_ZNK6fbxsdk14FbxFileTexture11GetFileNameEv', string, [ptr])(texture)
        result['textureFiles'].append(os.fsdecode(filename))
    # Check the reachable scene hierarchy, not only the scene's geometry pool.
    # GetMesh() can find a non-default attribute even when GetNodeAttribute()
    # is null. Importers traversing the default attribute would see no mesh.
    result['nodes'] = []
    def visit(node):
        attribute = function('_ZN6fbxsdk7FbxNode16GetNodeAttributeEv', ptr, [ptr])(node)
        mesh = function('_ZN6fbxsdk7FbxNode7GetMeshEv', ptr, [ptr])(node)
        skeleton = function('_ZN6fbxsdk7FbxNode11GetSkeletonEv', ptr, [ptr])(node)
        result['nodes'].append({
            'name': function('_ZNK6fbxsdk9FbxObject7GetNameEv', string, [ptr])(node).decode(),
            'mesh': bool(mesh), 'activeMesh': bool(mesh and attribute == mesh),
            'skeleton': bool(skeleton), 'activeSkeleton': bool(skeleton and attribute == skeleton),
            'visible': function('_ZNK6fbxsdk7FbxNode13GetVisibilityEv', c.c_double, [ptr])(node),
            'materials': function('_ZNK6fbxsdk7FbxNode16GetMaterialCountEv', integer, [ptr])(node),
            'vertices': function('_ZNK6fbxsdk15FbxGeometryBase21GetControlPointsCountEv', integer, [ptr])(mesh) if mesh else 0,
        })
        for i in range(function('_ZNK6fbxsdk7FbxNode13GetChildCountEb', integer, [ptr, boolean])(node, False)):
            visit(function('_ZN6fbxsdk7FbxNode8GetChildEi', ptr, [ptr, integer])(node, i))
    visit(function('_ZNK6fbxsdk8FbxScene11GetRootNodeEv', ptr, [ptr])(scene))
    print(json.dumps(result))
finally:
    function('_ZN6fbxsdk10FbxManager7DestroyEv', None, [ptr])(manager)
sys.exit(0 if imported else 1)
