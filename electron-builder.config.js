// Electron Builder Configuration
module.exports = {
  appId: 'com.tradingbot.app',
  productName: 'Trading Bot',
  copyright: 'Copyright © 2025 Trading Bot',
  
  // Build directories
  directories: {
    output: 'dist',
    buildResources: 'resources'
  },
  
  // Files to include/exclude
  files: [
    'build/**/*',
    'src/**/*',
    'public/**/*',
    'node_modules/**/*',
    '!node_modules/**/*.{md,MD,txt,TXT}',
    '!node_modules/**/{LICENSE,license}',
    '!node_modules/**/{README,readme}*',
    '!node_modules/**/test/**',
    '!node_modules/**/tests/**',
    '!node_modules/**/*.test.*',
    '!node_modules/**/*.spec.*',
    '!**/node_modules/.cache/**',
    '!src/**/*.{ts,tsx,jsx}',
    '!**/*.map',
    '!**/{.eslintrc,.babelrc,.prettierrc}*',
    '!**/{tsconfig,webpack.config}.*'
  ],
  
  extraResources: [
    {
      from: 'resources/icons',
      to: 'icons'
    }
  ],
  
  // Common settings
  compression: 'maximum',
  removePackageScripts: true,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  
  // Security settings
  electronVersion: '22.0.0',
  
  // Windows configuration
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'ia32']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ],
    icon: 'resources/icon.ico',
    publisherName: 'Trading Bot',
    verifyUpdateCodeSignature: false,
    requestedExecutionLevel: 'asInvoker',
    artifactName: '${productName}-Setup-${version}.${ext}'
  },
  
  // NSIS installer configuration
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'resources/icon.ico',
    uninstallerIcon: 'resources/icon.ico',
    installerHeaderIcon: 'resources/icon.ico',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Trading Bot',
    include: 'scripts/installer.nsh',
    runAfterFinish: true,
    artifactName: '${productName}-Setup-${version}.${ext}'
  },
  
  // Portable configuration
  portable: {
    artifactName: '${productName}-Portable-${version}.${ext}'
  },
  
  // macOS configuration
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64']
      }
    ],
    icon: 'resources/icon.icns',
    category: 'public.app-category.finance',
    darkModeSupport: true,
    hardenedRuntime: true,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    gatekeeperAssess: false,
    artifactName: '${productName}-${version}-${arch}.${ext}'
  },
  
  // DMG configuration
  dmg: {
    background: 'resources/dmg-background.png',
    iconSize: 100,
    contents: [
      {
        x: 380,
        y: 280,
        type: 'link',
        path: '/Applications'
      },
      {
        x: 110,
        y: 280,
        type: 'file'
      }
    ],
    window: {
      width: 540,
      height: 380
    },
    artifactName: '${productName}-${version}.${ext}'
  },
  
  // Linux configuration
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      },
      {
        target: 'deb',
        arch: ['x64']
      },
      {
        target: 'rpm',
        arch: ['x64']
      },
      {
        target: 'tar.gz',
        arch: ['x64']
      }
    ],
    icon: 'resources/icon.png',
    category: 'Finance',
    desktop: {
      Name: 'Trading Bot',
      Comment: 'Automated cryptocurrency trading bot',
      Keywords: 'trading;crypto;bitcoin;finance;',
      StartupWMClass: 'trading-bot'
    },
    artifactName: '${productName}-${version}-${arch}.${ext}'
  },
  
  // AppImage configuration
  appImage: {
    artifactName: '${productName}-${version}.${ext}'
  },
  
  // Debian package configuration
  deb: {
    packageCategory: 'misc',
    priority: 'optional',
    depends: ['libgtk-3-0', 'libnss3', 'libxss1', 'libgconf-2-4'],
    artifactName: '${productName}-${version}.${ext}'
  },
  
  // RPM package configuration
  rpm: {
    packageCategory: 'Applications/Internet',
    depends: ['gtk3', 'nss', 'libXScrnSaver'],
    artifactName: '${productName}-${version}.${ext}'
  },
  
  // Snap configuration
  snap: {
    grade: 'stable',
    confinement: 'strict',
    plugs: [
      'home',
      'network',
      'network-bind',
      'desktop',
      'desktop-legacy'
    ],
    stagePackages: [
      'libasound2',
      'libgconf-2-4',
      'libxss1'
    ],
    artifactName: '${productName}-${version}.${ext}'
  },
  
  // Auto-updater configuration
  publish: {
    provider: 'github',
    owner: 'your-username',
    repo: 'trading-bot',
    private: true,
    releaseType: 'draft'
  },
  
  // Squirrel.Windows configuration
  squirrelWindows: {
    iconUrl: 'https://raw.githubusercontent.com/your-username/trading-bot/main/resources/icon.ico',
    loadingGif: 'resources/loading.gif',
    msi: true
  },
  
  // Code signing (configure with your certificates)
  // win: {
  //   certificateFile: 'path/to/certificate.pfx',
  //   certificatePassword: process.env.CERTIFICATE_PASSWORD
  // },
  // mac: {
  //   identity: 'Developer ID Application: Your Name (TEAM_ID)'
  // },
  
  // Notarization for macOS (requires Apple Developer account)
  // afterSign: 'scripts/notarize.js',
  
  // Build hooks
  beforeBuild: async (context) => {
    console.log('Before build hook executed');
    // Add any pre-build logic here
  },
  
  afterPack: async (context) => {
    console.log('After pack hook executed');
    // Add any post-pack logic here
  },
  
  beforePack: async (context) => {
    console.log('Before pack hook executed');
    // Add any pre-pack logic here
  }
};
