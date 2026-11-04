declare module "*.po" {
  const catalog: Readonly<Record<string, string>>;
  export default catalog;
}
