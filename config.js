// By Heart: keys for the licensed Bible translations. Fill these in, then upload this file with the rest.
// Leave a value empty and that translation shows as "not set up yet". BSB, KJV and WEB always work.
window.BIBLE_CONFIG = {
  // NIV. A free app key from the YouVersion Platform (platform.youversion.com). Sign up, create an
  // app, add your website's address, and turn on the NIV. This key is meant to be used in web pages.
  youversionKey: "",

  // ESV. The web address of your proxy (see the esv-proxy folder next to this one), like
  // "https://by-heart-esv.yourname.workers.dev". Your ESV API key lives on the proxy, never here.
  esvProxy: "",

  // NKJV and CSB. The web address of the proxy that holds your API.Bible key. It's usually the same
  // Worker as the ESV, so paste the same address. The API.Bible key lives on the proxy, never here.
  apiBibleProxy: "",
};
