/**
 * Webpack configuration for eBook AI Reader
 * Bundles React renderer code and copies static HTML template
 */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/index.jsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  target: 'web', // Electron renderer runs in a browser context
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
    // Copy PDF.js worker to dist/ so it can be loaded locally
    new CopyPlugin({
      patterns: [
        {
          from: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
          to: 'pdf.worker.min.mjs',
        },
      ],
    }),
  ],
  // In development, allow importing electron
  externals: {
    electron: 'commonjs electron',
  },
  devtool: 'source-map',
};
