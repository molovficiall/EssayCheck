import type { Env, PagesFunction } from '../../lib/types';

export const onRequest: PagesFunction<Env> = async ({ next }) => next();
