const { chromium } = require('playwright');
const fs = require('fs');

async function runAccessibilityAudit() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to local dev server
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  // Inject axe-core
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.4/axe.min.js'
  });
  await page.waitForTimeout(500);
  
  // Run accessibility audit
  const results = await page.evaluate(() => {
    return new Promise((resolve) => {
      if (typeof axe === 'undefined') {
        resolve({ error: 'axe-core not loaded' });
        return;
      }
      axe.run(document, {}, (err, results) => {
        if (err) {
          resolve({ error: err.message });
        } else {
          resolve(results);
        }
      });
    });
  });
  
  await browser.close();
  
  // Save results
  fs.writeFileSync('a11y-results.json', JSON.stringify(results, null, 2));
  
  // Print summary
  if (results.error) {
    console.error('Error:', results.error);
    process.exit(1);
  }
  
  if (results.violations && results.violations.length > 0) {
    console.log(`\n❌ Found ${results.violations.length} accessibility violations:`);
    for (const violation of results.violations) {
      console.log(`\n  Rule: ${violation.id}`);
      console.log(`  Impact: ${violation.impact}`);
      console.log(`  Description: ${violation.description}`);
      console.log(`  Help: ${violation.helpUrl}`);
      console.log(`  Elements affected: ${violation.nodes.length}`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ No accessibility violations found!');
    process.exit(0);
  }
}

runAccessibilityAudit().catch(err => {
  console.error('Error running accessibility audit:', err);
  process.exit(1);
});
