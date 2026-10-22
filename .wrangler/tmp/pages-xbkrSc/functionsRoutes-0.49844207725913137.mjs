import { onRequest as __api_internal_me_ts_onRequest } from "C:\\Users\\kristofers\\Documents\\GitHub\\EssayCheck\\functions\\api\\internal\\me.ts"
import { onRequest as __api_internal_products_ts_onRequest } from "C:\\Users\\kristofers\\Documents\\GitHub\\EssayCheck\\functions\\api\\internal\\products.ts"
import { onRequest as __api_internal_upload_ts_onRequest } from "C:\\Users\\kristofers\\Documents\\GitHub\\EssayCheck\\functions\\api\\internal\\upload.ts"
import { onRequest as __api_media__key__ts_onRequest } from "C:\\Users\\kristofers\\Documents\\GitHub\\EssayCheck\\functions\\api\\media\\[key].ts"
import { onRequest as __api_checkout_ts_onRequest } from "C:\\Users\\kristofers\\Documents\\GitHub\\EssayCheck\\functions\\api\\checkout.ts"
import { onRequest as __api_products_ts_onRequest } from "C:\\Users\\kristofers\\Documents\\GitHub\\EssayCheck\\functions\\api\\products.ts"
import { onRequest as __api_webhook_ts_onRequest } from "C:\\Users\\kristofers\\Documents\\GitHub\\EssayCheck\\functions\\api\\webhook.ts"
import { onRequest as ___middleware_ts_onRequest } from "C:\\Users\\kristofers\\Documents\\GitHub\\EssayCheck\\functions\\_middleware.ts"

export const routes = [
    {
      routePath: "/api/internal/me",
      mountPath: "/api/internal",
      method: "",
      middlewares: [],
      modules: [__api_internal_me_ts_onRequest],
    },
  {
      routePath: "/api/internal/products",
      mountPath: "/api/internal",
      method: "",
      middlewares: [],
      modules: [__api_internal_products_ts_onRequest],
    },
  {
      routePath: "/api/internal/upload",
      mountPath: "/api/internal",
      method: "",
      middlewares: [],
      modules: [__api_internal_upload_ts_onRequest],
    },
  {
      routePath: "/api/media/:key",
      mountPath: "/api/media",
      method: "",
      middlewares: [],
      modules: [__api_media__key__ts_onRequest],
    },
  {
      routePath: "/api/checkout",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_checkout_ts_onRequest],
    },
  {
      routePath: "/api/products",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_products_ts_onRequest],
    },
  {
      routePath: "/api/webhook",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_webhook_ts_onRequest],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_ts_onRequest],
      modules: [],
    },
  ]