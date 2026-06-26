// Metro resolves static image imports to an opaque numeric asset id.
declare module "*.png" {
  const value: number;
  export default value;
}
