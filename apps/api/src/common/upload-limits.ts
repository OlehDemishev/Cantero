/**
 * Hard ceilings enforced by multer itself, before the request body is read into memory — every
 * `FileInterceptor("file", ...)` in this app should pass one of these as `limits.fileSize`.
 * A handful of services also re-check size against their own tighter business rule (e.g.
 * DocumentsService's 25MB, CompanyService's 1MB logo limit) once the file is already a Buffer;
 * those checks alone don't help here because multer has already fully buffered the upload by the
 * time a service method runs. MAX_UPLOAD_BYTES is the ceiling for everything else — CSV imports,
 * receipts, drawings, etc. — that has no size limit of its own today.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_LOGO_UPLOAD_BYTES = 1 * 1024 * 1024;
/** A whole drawing set in one PDF — tens of sheets of vector CAD output routinely pass 25MB. */
export const MAX_DRAWING_SET_UPLOAD_BYTES = 100 * 1024 * 1024;
