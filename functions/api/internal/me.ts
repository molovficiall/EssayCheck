import { json, type Ctx } from '../../_lib';
export const onRequest: PagesFunction = async (c) => json({ email: (c as unknown as Ctx).data.actor });
