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
    // Copy PDF.js worker and Tesseract.js worker + core WASM to dist/
    new CopyPlugin({
      patterns: [
        {
          from: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
          to: 'pdf.worker.min.mjs',
        },
        // Tesseract.js worker (runs in a Web Worker thread)
        {
          from: 'node_modules/tesseract.js/dist/worker.min.js',
          to: 'tesseract/worker.min.js',
        },
        // Tesseract.js core WASM (compiled OCR engine) — both standard and relaxedsimd
        {
          from: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
          to: 'tesseract/tesseract-core-lstm.wasm.js',
        },
        {
          from: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm',
          to: 'tesseract/tesseract-core-lstm.wasm',
        },
        {
          from: 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
          to: 'tesseract/tesseract-core-relaxedsimd-lstm.wasm.js',
        },
        {
          from: 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm',
          to: 'tesseract/tesseract-core-relaxedsimd-lstm.wasm',
        },
        // Tesseract language data (chi_sim + eng traineddata)
        {
          from: 'src/tesseract/tessdata',
          to: 'tesseract/tessdata',
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
