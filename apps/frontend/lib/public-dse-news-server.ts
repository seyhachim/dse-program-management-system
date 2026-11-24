import "server-only";
import type { PublicDseNewsArticle } from "@dse-pms/shared-types";
const API=(process.env.NEXT_PUBLIC_API_URL??"http://localhost:4000").replace(/\/+$/,"");
async function read<T>(path:string):Promise<T|null>{
  try{
    const response=await fetch(API+"/api/programme/public/news"+path,{
      headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(5000),
    });
    if(!response.ok)return null;
    return await response.json() as T;
  }catch{return null;}
}
export const publicNewsList=async()=>await read<PublicDseNewsArticle[]>("/")??[];
export const publicNewsArticle=(id:string)=>read<PublicDseNewsArticle>("/"+encodeURIComponent(id));
