"""Independently reconstruct all asset.json poses and compare with the project."""
import sys,zipfile,json,struct,math,base64
with zipfile.ZipFile(sys.argv[1]) as z:
    assert z.testzip() is None
    assert set(z.namelist()) == {'asset.json','atlas.png','README.txt'}
    project=json.load(open(sys.argv[2])); s=project['state']; asset=json.loads(z.read('asset.json'))
    assert asset['format']=='cube-studio-asset' and asset['version']==2
    assert asset['coordinates']['forward']=='-Z' and asset['coordinates']['up']=='+Y'
    png=z.read('atlas.png');resolution=s['textureSize']
    assert png[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',png[16:24])==(resolution,resolution)
    assert png==base64.b64decode(project['atlas'].split(',')[1])
    assert asset['texture']['width']==resolution and asset['texture']['filter']=='nearest'
    parts={p['id']:p for p in asset['parts']};joints={j['id']:j for j in asset['joints']}
    assert len(parts)==len(joints)==len(s['boxes'])
    def mul(a,b): return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]
    def inv(m):
        a=[[m[c][r] for c in range(3)]+[0] for r in range(3)]+[[0,0,0,1]]
        for r in range(3):a[r][3]=-sum(a[r][k]*m[k][3] for k in range(3))
        return a
    def transform(p,q):
        x,y,z,w=q;px,py,pz=p
        assert abs(sum(v*v for v in q)-1)<1e-7
        return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),px],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),py],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),pz],[0,0,0,1]]
    def cf(t):return transform(t['position'],t['rotation'])
    def world(p):
        m=transform(p['p'],p['q']);signs=[-1,1,-1,1]
        return [[m[r][c]*signs[r]*signs[c] for c in range(4)] for r in range(4)]
    def error(a,b):return max(abs(a[r][c]-b[r][c]) for r in range(4) for c in range(4))
    root=cf(asset['rigRoot']['restTransform']);errors=[]
    for b in s['boxes']:
        part=parts[b['id']];j=joints[b['id']];mesh=part['mesh']
        assert part['size']==b['size'] and part['canCollide']==False
        assert len(mesh['positions'])==len(mesh['normals'])==len(mesh['uvs'])==24 and len(mesh['indices'])==36
        assert all(0<=v<=1 for uv in mesh['uvs'] for v in uv)
        assert all(0<=i<24 for i in mesh['indices'])
        assert j['parentPartId']==b['parent'] and j['childPartId']==b['id']
        assert j['authoringConstraint']['axis']==b['axis']
        assert error(cf(part['restTransform']),world(b))<1e-7
        parent=root if b['parent'] is None else cf(parts[b['parent']]['restTransform'])
        assert error(mul(mul(parent,cf(j['c0'])),inv(cf(j['c1']))),world(b))<1e-7
    assert len(asset['animations'])==len(s['animations'])
    for animation,source in zip(asset['animations'],s['animations']):
        assert animation['id']==source['id'] and animation['name']==source['name']
        frames=source['frames']
        assert len(animation['keyframes'])==len(frames)
        for f,original in zip(animation['keyframes'],frames):
            assert f['time']==original['time']
            reconstructed={}
            for b in s['boxes']:
                j=joints[b['id']];parent=root if b['parent'] is None else reconstructed[b['parent']]
                got=mul(mul(mul(parent,cf(j['c0'])),cf(f['jointTransforms'][str(b['id'])])),inv(cf(j['c1'])))
                reconstructed[b['id']]=got
                errors.append(error(got,world(original['pose'][str(b['id'])])))
    assert max(errors,default=0)<1e-7
    print(f"PASS: {len(parts)} parts, {len(joints)} joints, {len(asset['animations'])} animations; full hierarchy reconstruction error {max(errors,default=0):.2g}; exact PNG and valid geometry.")
