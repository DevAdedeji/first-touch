"""Original footballer asset. Run with Blender 4.5+ in background mode."""
import bpy, math, os, random
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
random.seed(17)
def mat(name,color,rough=.65):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
    return m
kit=mat('Kit',(.055,.36,.22),.85);shorts=mat('Shorts',(.03,.1,.065),.9);skin=mat('Skin',(.38,.19,.10),.56)
hair=mat('Hair',(.028,.018,.012),.9);socks=mat('Socks',(.83,.88,.8),.95);boots=mat('Boots',(.05,.075,.07),.35)
trim=mat('Trim',(.91,.94,.86),.7);eyes=mat('Eyes',(.075,.052,.035),.35);white=mat('EyeWhite',(.76,.7,.61),.5)
def empty(name,loc,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc;o.parent=parent;return o
def sphere(name,loc,scale,material,parent=None,segments=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1)
    o=bpy.context.object;o.name=name;o.parent=parent;o.location=loc;o.scale=scale;o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=True
    return o
def tube(name,levels,material,parent,n=24):
    verts=[];faces=[]
    for z,rx,ry in levels:
        for j in range(n):
            a=2*math.pi*j/n;verts.append((math.cos(a)*rx,math.sin(a)*ry,z))
    for k in range(len(levels)-1):
        for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    faces.extend([tuple(range(n-1,-1,-1)),tuple((len(levels)-1)*n+j for j in range(n))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.parent=parent;o.data.materials.append(material)
    uv=mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        polygon.use_smooth=True
        for index in polygon.loop_indices:
            vi=mesh.loops[index].vertex_index;uv.data[index].uv=((vi%n)/(n-1),(vi//n)/(len(levels)-1))
    bevel=o.modifiers.new('Tailored edges','BEVEL');bevel.width=.009;bevel.segments=2
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
    return o
root=empty('Footballer',(0,0,0))
body=empty('Body',(0,0,0),root)
tube('Shirt',[(.94,.15,.105),(1.03,.17,.105),(1.16,.18,.11),(1.32,.235,.135),(1.43,.25,.125),(1.48,.20,.10),(1.51,.09,.073)],kit,body)
tube('Collar',[(1.505,.096,.079),(1.525,.087,.074)],trim,body)
tube('Waistband',[(.95,.16,.11),(.98,.16,.11)],shorts,root)
sphere('Neck',(0,0,1.56),(.069,.066,.105),skin,body)
head=sphere('Head',(0,-.008,1.73),(.104,.099,.142),skin,body,32,24)
for v in head.data.vertices:
    if v.co.z<-.25:v.co.x*=.76+(v.co.z+1)*.24
# Short cropped hair, with an actual forehead and facial silhouette.
h=sphere('Hair',(0,.006,1.765),(.108,.105,.115),hair,body,24,16)
for v in h.data.vertices:
    if v.co.z<0:v.co.z*=.22
for sign in [-1,1]:
    sphere('Ear'+str(sign),(sign*.102,0,1.721),(.021,.018,.036),skin,body,12,8)
    sphere('EyeWhite'+str(sign),(sign*.037,-.094,1.748),(.022,.010,.012),white,body,12,8)
    sphere('Eye'+str(sign),(sign*.037,-.103,1.748),(.008,.003,.008),eyes,body,12,8)
    sphere('Brow'+str(sign),(sign*.037,-.097,1.769),(.029,.007,.006),hair,body,12,8)
sphere('Nose',(0,-.103,1.712),(.02,.029,.037),skin,body,16,10)
sphere('Mouth',(0,-.093,1.672),(.032,.008,.006),hair,body,16,8)
for side,x in [('Left',-.116),('Right',.116)]:
    leg=empty(side+'Leg',(x,0,.94),root)
    tube(side+'Shorts',[(-.25,.092,.104),(-.05,.102,.108),(.02,.097,.105)],shorts,leg)
    sphere(side+'Thigh',(0,0,-.23),(.091,.097,.225),skin,leg)
    knee=empty(side+'Knee',(0,-.003,-.40),leg)
    sphere(side+'Kneecap',(0,-.014,0),(.065,.07,.071),skin,knee)
    tube(side+'Sock',[(-.39,.043,.047),(-.31,.045,.055),(-.19,.063,.067),(-.07,.067,.062)],socks,knee)
    tube(side+'SockBand',[(-.09,.069,.064),(-.06,.069,.064)],kit,knee)
    ankle=empty(side+'Ankle',(0,0,-.41),knee)
    sphere(side+'Boot',(0,-.045,-.037),(.057,.113,.050),boots,ankle)
    sphere(side+'Sole',(0,-.046,-.070),(.057,.114,.014),trim,ankle,16,8)
    for j in range(4):sphere(side+'Lace'+str(j),(0,-.027-j*.014,.002),(.039,.004,.004),trim,ankle,8,6)
    arm=empty(side+'Arm',(x*2.25,0,1.43),body)
    sphere(side+'Sleeve',(x*.14,0,-.065),(.086,.092,.126),kit,arm)
    sphere(side+'UpperArm',(x*.26,0,-.17),(.058,.061,.17),skin,arm)
    elbow=empty(side+'Elbow',(x*.4,0,-.30),arm)
    sphere(side+'Forearm',(0,-.012,-.118),(.047,.05,.146),skin,elbow)
    sphere(side+'Hand',(0,-.022,-.275),(.047,.028,.076),skin,elbow)
    sphere(side+'Thumb',(-x*.25,-.043,-.258),(.02,.022,.037),skin,elbow,12,8)
# Export original source and compact shared geometry; animation is applied to named joints at runtime.
os.makedirs(os.path.join(ROOT,'assets'),exist_ok=True);os.makedirs(os.path.join(ROOT,'public','models'),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets','footballer.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public','models','footballer.glb'),export_format='GLB',export_yup=True)
