/** Rules first; never call a model just to decide which worker to wake. */
export type TaskTier = 'XS' | 'S' | 'M' | 'L';
export const TASK_LIMITS = {
  XS:{seconds:60,tokens:150000,steps:8,retries:1},
  S:{seconds:180,tokens:500000,steps:25,retries:2},
  M:{seconds:600,tokens:1500000,steps:80,retries:2},
  L:{seconds:1800,tokens:3000000,steps:200,retries:3}
} as const;
export function routeCodingTask(request:{prompt:string;repo:'FE'|'BE';tier?:TaskTier;edit?:unknown}) {
  const text=request.prompt.toLowerCase();
  const risk=/permission|payment|secret|privacy|migration|infrastructure|delete data|authentication|authorization|password|login (flow|logic|validation)|\bauth\b|phân quyền|thanh toán|mật khẩu|xóa dữ liệu/.test(text);
  let tier:TaskTier=request.edit?'XS':request.tier??(/full.stack|cross.repo|architecture|toàn bộ/.test(text)?'L':risk?'M':/button|label|copy|màu|đổi chữ/.test(text)?'XS':'S');
  if(risk&&(tier==='XS'||tier==='S'))tier='M';
  return {repo:request.repo,tier,risk:risk?'elevated':'low',roles:[request.repo==='FE'?'frontend':'backend'],manager:false,reviewRequired:risk||tier==='L',...TASK_LIMITS[tier],automaticRetries:0};
}
