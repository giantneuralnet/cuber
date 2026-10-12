// Independent validation helper: compile with the upstream ufbx.c and ufbx.h.
#include "ufbx.h"
#include <stdio.h>
#include <stdlib.h>
static void geometry(ufbx_scene *s) {
 printf("[");
 for(size_t i=0;i<s->meshes.count;i++){
  ufbx_mesh *m=s->meshes.data[i];if(i)printf(",");
  printf("{\"name\":\"%s\",\"triangles\":%zu,\"skins\":%zu,\"positions\":[",m->name.data,m->num_triangles,m->skin_deformers.count);
  for(size_t j=0;j<m->num_indices;j++){
   ufbx_vec3 p=ufbx_get_vertex_vec3(&m->vertex_position,j);
   if(m->skin_deformers.count){ufbx_skin_cluster *c=m->skin_deformers.data[0]->clusters.data[0];p=ufbx_transform_position(&c->geometry_to_world,p);}
   if(j)printf(",");printf("%.10g,%.10g,%.10g",p.x,p.y,p.z);
  }
  printf("],\"uvs\":[");
  for(size_t j=0;j<m->num_indices;j++){ufbx_vec2 uv=ufbx_get_vertex_vec2(&m->vertex_uv,j);if(j)printf(",");printf("%.10g,%.10g",uv.x,uv.y);}
  printf("]}");
 }
 printf("]");
}
int main(int argc,char **argv){
 if(argc<2)return 2;ufbx_error error;ufbx_load_opts opts={0};opts.strict=true;
 ufbx_scene *s=ufbx_load_file(argv[1],&opts,&error);
 if(!s){char msg[4096];ufbx_format_error(msg,sizeof(msg),&error);fprintf(stderr,"%s\n",msg);return 1;}
 size_t embedded=0;for(size_t i=0;i<s->textures.count;i++)embedded+=s->textures.data[i]->content.size;
 printf("{\"bones\":%zu,\"materials\":%zu,\"textures\":%zu,\"embeddedBytes\":%zu,\"meshes\":",s->bones.count,s->materials.count,s->textures.count,embedded);geometry(s);
 printf(",\"animations\":[");
 for(size_t i=0;i<s->anim_stacks.count;i++){
  if(i)printf(",");ufbx_anim_stack *a=s->anim_stacks.data[i];double t=argc>2?atof(argv[2]):a->time_end/2;
  ufbx_scene *pose=ufbx_evaluate_scene(s,a->anim,t,NULL,&error);if(!pose)return 3;
  printf("{\"name\":\"%s\",\"start\":%.10g,\"end\":%.10g,\"time\":%.10g,\"meshes\":",a->name.data,a->time_begin,a->time_end,t);geometry(pose);printf("}");ufbx_free_scene(pose);
 }
 printf("]}\n");ufbx_free_scene(s);return 0;
}
