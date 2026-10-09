const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    entry: './src/renderer/index.js',
    target: 'web',

    output: {
      path: path.resolve(__dirname, 'build'),
      filename: isDev ? '[name].js' : '[name].[contenthash].js',
      publicPath: isDev ? '/' : './',
      clean: true,
      globalObject: 'window'
    },

    module: {
      rules: [
        {
          test: /\.m?js$/,
          resolve: {
            fullySpecified: false
          }
        },
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
              maxSize: 8 * 1024
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
      extensions: ['.js', '.jsx', '.mjs', '.json'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@components': path.resolve(__dirname, 'src/renderer/components'),
        '@hooks': path.resolve(__dirname, 'src/renderer/hooks'),
        '@utils': path.resolve(__dirname, 'src/renderer/utils'),
        '@core': path.resolve(__dirname, 'src/core'),
        '@services': path.resolve(__dirname, 'src/services')
      },
      fallback: {
        // ✅ FIX: webpack HMR emitter does `require('events')`.
        // With target:'web' there's no Node runtime to satisfy that,
        // so webpack must bundle the browser events shim.
        events: require.resolve('events/'),
        process: require.resolve('process/browser.js'),
        buffer: require.resolve('buffer/')
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

      new webpack.DefinePlugin({
        global: 'window'
      }),

      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer']
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
          },
          {
            from: path.resolve(__dirname, 'src/core'),
            to: path.resolve(__dirname, 'build/core')
          },
          {
            from: path.resolve(__dirname, 'src/database'),
            to: path.resolve(__dirname, 'build/database')
          },
          {
            from: path.resolve(__dirname, 'src/services'),
            to: path.resolve(__dirname, 'build/services')
          }
        ]
      })
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

    // ⚠️ NOTE: `crypto` is listed here. If the renderer ever imports
    // `src/renderer/utils/encryption.js`, this will break with
    // "require is not defined". It's fine for now because nothing
    // in the renderer imports it yet. When you do, remove `crypto`
    // from this block and add a browser crypto polyfill instead.
    externals: {
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