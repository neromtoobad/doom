// webpack emits these as asset/resource (see next.config.js); the default export is
// the emitted URL, already carrying basePath.
declare module "*.mp4" {
  const src: string;
  export default src;
}
