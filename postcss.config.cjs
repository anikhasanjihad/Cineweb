// The phone layout is written as `@media (max-width: 700px) { ... }` (and a landscape block) in src/styles.css.
// This plugin turns those blocks into `html.phone ...` rules, so the phone layout no longer depends on the
// browser's reported width: a small script sets the `phone` class on <html> for phones (also when the browser
// is in "desktop site" mode, or inside Telegram), see src/lib/device.ts and index.html.
const phoneRules = () => ({
  postcssPlugin: 'phone-class',
  Once(root) {
    root.walkAtRules('media', at => {
      const portrait = /max-width:\s*700px/.test(at.params);
      const landscape = /max-height:\s*480px/.test(at.params);
      if (!portrait && !landscape) return;
      at.walkRules(rule => {
        rule.selectors = rule.selectors.map(sel => (sel.startsWith(':root') ? 'html.phone' + sel.slice(5) : 'html.phone ' + sel));
      });
      if (portrait) at.replaceWith(at.nodes);
    });
  },
});
phoneRules.postcss = true;
module.exports = {plugins: [phoneRules()]};
