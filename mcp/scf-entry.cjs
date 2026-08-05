exports.main_handler = async (event, context) => {
  const { main_handler } = await import('./metainsight-server.mjs');
  return main_handler(event, context);
};
