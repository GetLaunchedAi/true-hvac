#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Automated Sitemap Generator
 * Generates sitemap.xml automatically during build process
 */

// Configuration
const CONFIG = {
  baseUrl: 'https://truehvac.co/',
  publicDir: path.join(__dirname, '../public'),
  outputFile: 'sitemap.xml',
  robotsFile: 'robots.txt',
  // Priority and changefreq rules
  rules: {
    '/': { priority: '1.00', changefreq: 'weekly' },
    '/about/': { priority: '0.80', changefreq: 'monthly' },
    '/contact/': { priority: '0.80', changefreq: 'monthly' },
    '/services/': { priority: '0.80', changefreq: 'monthly' },
    '/projects/': { priority: '0.80', changefreq: 'monthly' },
    '/reviews/': { priority: '0.80', changefreq: 'monthly' },
    // Default for other pages
    default: { priority: '0.50', changefreq: 'monthly' }
  },
  // Exclude patterns
  exclude: [
    'robots.txt',
    '_redirects',
    'sitemap.xml',
    'assets/',
    'css/',
    'js/',
    'images/',
    'favicons/',
    'fonts/',
    'svgs/',
    'admin/'
  ]
};

/**
 * Get file modification time in ISO format
 */
function getLastMod(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime.toISOString();
  } catch (error) {
    console.warn(`Warning: Could not get modification time for ${filePath}`);
    return new Date().toISOString();
  }
}

/**
 * Check if path should be excluded
 */
function shouldExclude(relativePath) {
  return CONFIG.exclude.some(pattern => {
    if (pattern.endsWith('/')) {
      return relativePath.startsWith(pattern);
    }
    return relativePath === pattern || relativePath.endsWith(pattern);
  });
}

/**
 * Get priority and changefreq for a URL
 */
function getUrlConfig(url) {
  // Check for exact matches first
  if (CONFIG.rules[url]) {
    return CONFIG.rules[url];
  }
  
  // Check for service pages
  if (url.startsWith('/services/')) {
    return { priority: '0.80', changefreq: 'monthly' };
  }
  
  // Return default
  return CONFIG.rules.default;
}

/**
 * Convert file path to URL
 */
function pathToUrl(filePath, publicDir) {
  const relativePath = path.relative(publicDir, filePath).replace(/\\/g, '/');
  
  // Handle root index.html file
  if (relativePath === 'index.html') {
    return '/';
  }
  
  // Handle index.html files in subdirectories
  if (relativePath.endsWith('/index.html')) {
    return '/' + relativePath.replace('index.html', '');
  }
  
  // Handle other HTML files
  if (relativePath.endsWith('.html')) {
    return '/' + relativePath.replace('.html', '/');
  }
  
  return '/' + relativePath;
}

/**
 * Discover all HTML pages in public directory
 */
function discoverPages(publicDir) {
  const pages = [];
  
  function scanDirectory(dir) {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.relative(publicDir, fullPath).replace(/\\/g, '/');
        
        // Skip excluded items
        if (shouldExclude(relativePath)) {
          continue;
        }
        
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          scanDirectory(fullPath);
        } else if (item.endsWith('.html')) {
          const url = pathToUrl(fullPath, publicDir);
          const lastmod = getLastMod(fullPath);
          const config = getUrlConfig(url);
          
          pages.push({
            url,
            lastmod,
            priority: config.priority,
            changefreq: config.changefreq
          });
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not scan directory ${dir}:`, error.message);
    }
  }
  
  scanDirectory(publicDir);
  return pages;
}

/**
 * Generate XML sitemap content
 */
function generateSitemapXml(pages) {
  const allUrls = [...pages];
  
  // Sort URLs by priority (highest first), then by URL
  allUrls.sort((a, b) => {
    const priorityDiff = parseFloat(b.priority) - parseFloat(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.url.localeCompare(b.url);
  });
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

`;
  
  for (const urlData of allUrls) {
    // Ensure no double slashes in URL
    const baseUrl = CONFIG.baseUrl.endsWith('/') ? CONFIG.baseUrl.slice(0, -1) : CONFIG.baseUrl;
    const urlPath = urlData.url.startsWith('/') ? urlData.url : '/' + urlData.url;
    const fullUrl = baseUrl + urlPath;
    
    xml += `  <url>
    <loc>${fullUrl}</loc>
    <lastmod>${urlData.lastmod}</lastmod>
    <changefreq>${urlData.changefreq}</changefreq>
    <priority>${urlData.priority}</priority>
  </url>

`;
  }
  
  xml += '</urlset>';
  return xml;
}

/**
 * Update robots.txt with correct sitemap URL
 */
function updateRobotsTxt() {
  const robotsPath = path.join(CONFIG.publicDir, CONFIG.robotsFile);
  const baseUrl = CONFIG.baseUrl.endsWith('/') ? CONFIG.baseUrl.slice(0, -1) : CONFIG.baseUrl;
  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  
  try {
    let robotsContent;
    
    // Check if robots.txt exists
    if (fs.existsSync(robotsPath)) {
      robotsContent = fs.readFileSync(robotsPath, 'utf8');
    } else {
      // Create default robots.txt if it doesn't exist
      robotsContent = `User-agent: *
Disallow: /admin/
Allow: /

Sitemap: ${sitemapUrl}
`;
    }
    
    // Update or add sitemap URL
    const sitemapRegex = /^Sitemap:\s*.+$/m;
    if (sitemapRegex.test(robotsContent)) {
      // Replace existing sitemap line
      robotsContent = robotsContent.replace(sitemapRegex, `Sitemap: ${sitemapUrl}`);
    } else {
      // Add sitemap line if it doesn't exist
      robotsContent = robotsContent.trim() + `\n\nSitemap: ${sitemapUrl}\n`;
    }
    
    fs.writeFileSync(robotsPath, robotsContent, 'utf8');
    console.log(`🤖 Updated robots.txt with sitemap URL: ${sitemapUrl}`);
    
  } catch (error) {
    console.warn('Warning: Could not update robots.txt:', error.message);
  }
}

/**
 * Main function
 */
function generateSitemap() {
  console.log('🗺️  Generating sitemap...');
  
  // Check if public directory exists
  if (!fs.existsSync(CONFIG.publicDir)) {
    console.error(`Error: Public directory "${CONFIG.publicDir}" does not exist. Run build first.`);
    process.exit(1);
  }
  
  // Discover pages
  console.log('📄 Discovering pages...');
  const pages = discoverPages(CONFIG.publicDir);
  console.log(`Found ${pages.length} pages`);
  
  // Generate sitemap
  console.log('⚙️  Generating XML...');
  const sitemapXml = generateSitemapXml(pages);
  
  // Write sitemap
  const outputPath = path.join(CONFIG.publicDir, CONFIG.outputFile);
  fs.writeFileSync(outputPath, sitemapXml, 'utf8');
  
  // Update robots.txt
  console.log('🤖 Updating robots.txt...');
  updateRobotsTxt();
  
  console.log(`✅ Sitemap generated successfully!`);
  console.log(`📊 Total URLs: ${pages.length}`);
  console.log(`📄 Pages: ${pages.length}`);
  console.log(`📁 Output: ${outputPath}`);
}

// Run if called directly
if (require.main === module) {
  generateSitemap();
}

module.exports = { generateSitemap };
