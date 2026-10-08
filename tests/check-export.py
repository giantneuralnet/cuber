"""Verify the actual exported archive, XML rig, and Motor6D pose transforms."""
import sys, zipfile, json, xml.etree.ElementTree as ET, math, struct
path=sys.argv[1]
with zipfile.ZipFile(path) as z:
    assert z.testzip() is None
    project=json.loads(z.read('model.cube'))
    s=project['state']
    xml=ET.fromstring(z.read('model.rbxmx'))
    png=z.read('meshes/atlas.png')
    assert png[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II',png[16:24]) == (2048,2048)
    for b in s['boxes']:
        obj=z.read(f"meshes/Cube_{b['id']}.obj").decode()
        assert sum(l.startswith('v ') for l in obj.splitlines()) == 24
        assert sum(l.startswith('vt ') for l in obj.splitlines()) == 24
        assert sum(l.startswith('f ') for l in obj.splitlines()) == 12
        for l in obj.splitlines():
            if l.startswith('vt '): assert all(0 <= float(v) <= 1 for v in l.split()[1:])
        vertices=[list(map(float,l.split()[1:])) for l in obj.splitlines() if l.startswith('v ')]
        size=b.get('size',[1,1,1])
        extent=[max(v[i] for v in vertices)-min(v[i] for v in vertices) for i in range(3)]
        assert max(abs(extent[i]-size[i]) for i in range(3)) < 1e-7
        part=xml.find(f".//Item[@referent='P{b['id']}']/Properties")
        assert [float(part.findtext(f"Vector3[@name='size']/{axis}")) for axis in 'XYZ'] == size
        if project['version'] >= 2:
            assert xml.findtext(f".//Item[@referent='AXIS{b['id']}']/Properties/string[@name='Value']") == b.get('axis','omni')
    refs={i.attrib['referent']:i for i in xml.iter('Item')}
    assert len(refs)==len(list(xml.iter('Item')))
    for r in xml.iter('Ref'): assert r.text in refs or r.text in ('null','nil')
    motors=xml.findall('.//Item[@class="Motor6D"]')
    assert len(motors)==len(s['boxes']) # Includes RigRoot -> first cube
    keys=xml.findall('.//Item[@class="Keyframe"]')
    assert len(keys)==max(1,len(s['frames']))
    def mul(a,b): return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]
    def inv(m):
        a=[[m[c][r] for c in range(3)]+[0] for r in range(3)]+[[0,0,0,1]]
        for r in range(3): a[r][3]=-sum(a[r][k]*m[k][3] for k in range(3))
        return a
    def cf(e):
        return [[float(e.findtext(f'R{r}{c}')) for c in range(3)]+[float(e.findtext('XYZ'[r]))] for r in range(3)]+[[0,0,0,1]]
    def world(p):
        x,y,z,w=p['q'];px,py,pz=p['p']
        return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),px],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),py],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),pz],[0,0,0,1]]
    errors=[]
    for i,f in enumerate(s['frames']):
        for b in s['boxes']:
            props=refs[f"M{b['id']}"] .find('Properties')
            c0=cf(props.find("CoordinateFrame[@name='C0']"));c1=cf(props.find("CoordinateFrame[@name='C1']"))
            p=cf(refs[f"F{i}P{b['id']}"] .find("Properties/CoordinateFrame[@name='CFrame']"))
            parent=world(s['boxes'][0]) if b['parent'] is None else world(f['pose'][str(b['parent'])])
            got=mul(mul(mul(parent,c0),p),inv(c1));want=world(f['pose'][str(b['id'])])
            errors.append(max(abs(got[r][c]-want[r][c]) for r in range(4) for c in range(4)))
    assert max(errors,default=0) < 1e-6, errors
    print(f"PASS: {len(s['boxes'])} cubes, {len(motors)} Motor6Ds, {len(keys)} keyframes; valid archive, atlas, UVs, sizes, axes and references; pose reconstruction error {max(errors,default=0):.2g}")
