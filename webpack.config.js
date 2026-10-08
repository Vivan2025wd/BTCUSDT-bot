const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    entry: './src/renderer/index.js',
    target: 'electron-renderer',
    
    output: {
      path: path.resolve(__dirname, 'build'),
      filename: isDev ? '[name].js' : '[name].[contenthash].js',
      publicPath: isDev ? '/' : './',
      clean: true
    },

    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: { electron: '27' } }],
                ['@babel/preset-react', { runtime: 'automatic' }]
              ],
              plugins: []
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader']
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: 8 * 1024 // 8KB
            }
          }
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/,
          type: 'asset/resource'
        }
      ]
    },

    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@components': path.resolve(__dirname, 'src/renderer/components'),
        '@hooks': path.resolve(__dirname, 'src/renderer/hooks'),
        '@utils': path.resolve(__dirname, 'src/renderer/utils'),
        '@core': path.resolve(__dirname, 'src/core'),
        '@services': path.resolve(__dirname, 'src/services')
      }
    },

    plugins: [
  new HtmlWebpackPlugin({
    template: './public/index.html',
    filename: 'index.html',
    inject: true,
    minify: !isDev ? {
      removeComments: true,
      collapseWhitespace: true,
      removeRedundantAttributes: true,
      useShortDoctype: true,
      removeEmptyAttributes: true,
      removeStyleLinkTypeAttributes: true,
      keepClosingSlash: true,
      minifyJS: true,
      minifyCSS: true,
      minifyURLs: true
    } : false
  }),

  // Add this ProvidePlugin to polyfill global & process
  new webpack.ProvidePlugin({
    process: 'process/browser',
    Buffer: ['buffer', 'Buffer'],
  }),

  new CopyWebpackPlugin({
    patterns: [
      {
        from: path.resolve(__dirname, 'public'),
        to: path.resolve(__dirname, 'build'),
        globOptions: {
          ignore: ['**/index.html']
        }
      },
      {
        from: path.resolve(__dirname, 'src/main'),
        to: path.resolve(__dirname, 'build/main')
      }
    ]
  }),
],

    devServer: {
      static: {
        directory: path.join(__dirname, 'build')
      },
      port: 3000,
      host: 'localhost',
      hot: true,
      compress: true,
      historyApiFallback: true,
      allowedHosts: 'all',
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      client: {
        overlay: {
          errors: true,
          warnings: false
        }
      }
    },

    devtool: isDev ? 'eval-source-map' : 'source-map',

    optimization: {
      minimize: !isDev,
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10
          },
          common: {
            minChunks: 2,
            chunks: 'all',
            priority: 5,
            reuseExistingChunk: true
          }
        }
      }
    },

    externals: {
      // Don't bundle these Node.js modules
      'sqlite3': 'commonjs sqlite3',
      'ws': 'commonjs ws',
      'crypto': 'commonjs crypto'
    },

    node: {
      __dirname: false,
      __filename: false
    },

    stats: {
      errorDetails: true,
      children: false,
      modules: false,
      chunks: false,
      chunkModules: false
    }
  };
};
