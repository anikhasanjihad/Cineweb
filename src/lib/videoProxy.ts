// Video never goes through our proxy: it always plays straight from the provider's server, so no video data
// uses Vercel bandwidth. (Streams that need Referer / User-Agent headers cannot play in a browser without a
// proxy, so those are skipped.)
export const videoProxyAllowed = async (_force = false): Promise<boolean> => false;
export const setVideoProxyAllowed = async (_on: boolean): Promise<string> => '';
