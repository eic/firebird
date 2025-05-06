const path = require('path');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  resolve: {
    alias: {
      //'three/examples/jsm/utils/BufferGeometryUtils': path.resolve('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'),
      // Add more aliases if there are other problematic imports
    }
  },
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',  // Generates a static HTML file with a treemap.
      reportFilename: 'bundle-report.html',  // Can be opened in a browser after build.
      openAnalyzer: false,  // Prevents the report from automatically opening.
      generateStatsFile: true//  // Generates a stats.json.
      //statsFilename: 'bundle-stats.json'  // Useful for custom analysis.
    })
  ]
};
