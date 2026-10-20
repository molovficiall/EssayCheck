# STRIDE threat model

## Assets and boundaries

Order integrity, variant inventory, customer fulfillment details, administrator access, catalog content, and uploaded product images are the protected assets. The browser is untrusted. Cloudflare Pages Functions are the API boundary; D1 is the authoritative catalog/order store; R2 stores uploaded media; Cloudflare Access and Stripe are external trust providers.

## Threats and controls

| Threat                  | Attack path                                              | Controls                                                                                                                     |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Cart tampering          | Client alters product IDs, quantity, or cached prices    | Strict Zod schema; D1 lookups for every variant; server-derived integer prices; quantity and line caps                       |
| Price manipulation      | Client submits a low price before checkout               | Checkout builds Stripe `price_data` only from D1                                                                             |
| Webhook spoofing/replay | Attacker submits fake or repeated fulfillment events     | Raw-body Stripe HMAC verification, five-minute tolerance, unique event ID, transactional D1 batch                            |
| Admin takeover          | Forged Access assertion or stolen session invokes writes | Cloudflare Access MFA policy, RS256 JWT verification, issuer/audience/expiry checks, email allowlist, same-origin CSRF token |
| Upload abuse            | HTML/polyglot or oversized file reaches image delivery   | 5 MiB cap, JPEG/PNG/WebP MIME and magic-byte checks, random object keys, strict media route and nosniff                      |
| Enumeration             | Unauthenticated caller probes catalog management routes  | Access at edge and Function verification; uniform 404                                                                        |
| Inventory race          | Concurrent checkouts purchase last unit                  | Stock decrement occurs inside the webhook D1 batch; SQLite trigger aborts any negative stock change                          |
| SSRF                    | User supplies arbitrary URL to an outbound fetch         | No user-controlled URLs are fetched; outbound hosts are fixed Stripe and Access JWKS endpoints                               |

## Residual risks

R2 upload currently preserves file bytes; configure an image-processing pipeline to strip EXIF metadata before accepting real customer-facing assets. Configure Cloudflare rate-limiting rules and alerts in the production account, monitor Stripe webhook failures, and test inventory races with the deployed D1 database before launch.
