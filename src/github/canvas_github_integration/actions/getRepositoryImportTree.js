import { db } from "../../../../config/firebase.js";
import { Octokit } from "octokit";


const getGitHubToken = async (userId, uid = null) => {
  if (!userId && !uid) {
    throw new Error("userId or uid is required");
  }
  
  let doc = null;
  
  
  if (userId) {
    const githubIdStr = String(userId).trim();
    console.log("Fetching GitHub token for userId:", githubIdStr, "type:", typeof userId);
    
    
    doc = await db.collection("user_tokens").doc(githubIdStr).get();
    
    
    if (!doc.exists) {
      console.log(`Token not found with exact match: ${githubIdStr}, trying alternative formats...`);
      
      
      if (!isNaN(githubIdStr)) {
        const numId = parseInt(githubIdStr, 10);
        console.log(`Trying as number: ${numId}`);
        doc = await db.collection("user_tokens").doc(String(numId)).get();
        
        if (!doc.exists) {
          console.log(`Trying as number string: ${numId.toString()}`);
          doc = await db.collection("user_tokens").doc(numId.toString()).get();
        }
      }
    }
    
    if (doc && doc.exists) {
      const tokenData = doc.data();
      if (tokenData && tokenData.accessToken) {
        console.log("GitHub token found successfully for userId:", githubIdStr);
        return tokenData.accessToken;
      }
    }
  }
  
  
  if (uid) {
    console.log(`Token not found with userId, trying to find via user_githubs with uid: ${uid}...`);
    
    const userGithubsDoc = await db.collection("user_githubs").doc(uid).get();
    
    if (userGithubsDoc.exists) {
      const userData = userGithubsDoc.data();
      console.log(`Found user_githubs document for uid: ${uid}`, {
        github_ids: userData.github_ids,
        github_ids_length: userData.github_ids?.length
      });
      
      if (userData.github_ids && Array.isArray(userData.github_ids) && userData.github_ids.length > 0) {
        
        for (const githubIdFromArray of userData.github_ids) {
          const githubIdToTry = String(githubIdFromArray).trim();
          console.log(`Trying githubId from user_githubs: ${githubIdToTry}`);
          
          doc = await db.collection("user_tokens").doc(githubIdToTry).get();
          if (doc.exists) {
            const tokenData = doc.data();
            if (tokenData && tokenData.accessToken) {
              console.log(`Found token with githubId from user_githubs: ${githubIdToTry}`);
              return tokenData.accessToken;
            }
          }
        }
      }
    } else {
      console.log(`user_githubs document not found for uid: ${uid}`);
    }
  }
  
  
  if (userId) {
    console.log(`Searching ALL user_githubs documents for githubId: ${userId}...`);
    const allUserGithubs = await db.collection("user_githubs").get();
    console.log(`Found ${allUserGithubs.docs.length} user_githubs documents to search`);
    
    for (const userDoc of allUserGithubs.docs) {
      const userData = userDoc.data();
      const docId = userDoc.id;
      
      if (userData.github_ids && Array.isArray(userData.github_ids)) {
        
        const hasMatchingId = userData.github_ids.some(id => String(id).trim() === String(userId).trim());
        
        if (hasMatchingId) {
          console.log(`Found matching githubId ${userId} in user_githubs document: ${docId}`);
          
          for (const githubIdFromArray of userData.github_ids) {
            const githubIdToTry = String(githubIdFromArray).trim();
            console.log(`Trying githubId from matched user_githubs: ${githubIdToTry}`);
            
            doc = await db.collection("user_tokens").doc(githubIdToTry).get();
            if (doc.exists) {
              const tokenData = doc.data();
              if (tokenData && tokenData.accessToken) {
                console.log(`Found token with githubId from matched user_githubs: ${githubIdToTry}`);
                return tokenData.accessToken;
              }
            }
          }
        }
      }
    }
  }
  
  
  
  if (uid) {
    console.log(`Trying to find ANY token associated with uid: ${uid}...`);
    const userGithubsDoc = await db.collection("user_githubs").doc(uid).get();
    
    if (userGithubsDoc.exists) {
      const userData = userGithubsDoc.data();
      if (userData.github_ids && Array.isArray(userData.github_ids) && userData.github_ids.length > 0) {
        
        const firstGithubId = String(userData.github_ids[0]).trim();
        console.log(`Trying first githubId from user_githubs: ${firstGithubId}`);
        doc = await db.collection("user_tokens").doc(firstGithubId).get();
        if (doc.exists) {
          const tokenData = doc.data();
          if (tokenData && tokenData.accessToken) {
            console.log(`Found token with first githubId from user_githubs: ${firstGithubId}`);
            return tokenData.accessToken;
          }
        }
      }
    }
  }
  
  
  
  console.log(`Trying to use ANY available token as last resort...`);
  const allTokens = await db.collection("user_tokens").get();
  if (allTokens.docs.length > 0) {
    
    const firstToken = allTokens.docs[0];
    const tokenData = firstToken.data();
    if (tokenData && tokenData.accessToken) {
      console.warn(`Using first available token as fallback: ${firstToken.id}`);
      return tokenData.accessToken;
    }
  }
  
  
  const availableIds = allTokens.docs.map(d => ({ id: d.id, type: typeof d.id }));
  console.error(`GitHub token not found for userId: ${userId || 'N/A'}, uid: ${uid || 'N/A'}`);
  console.error(`Available token IDs (first 10):`, availableIds.slice(0, 10));
  throw new Error(`GitHub token not found for userId: ${userId || 'N/A'}`);
};


const extractRelativeImports = (content, currentFilePath, language = null) => {
  if (!content || typeof content !== 'string') return [];

  const imports = [];
  
  
  if (!language) {
    const ext = currentFilePath.toLowerCase().substring(currentFilePath.lastIndexOf('.'));
    const extToLang = {
      '.js': 'javascript', '.jsx': 'react', '.ts': 'typescript', '.tsx': 'react',
      '.java': 'java', '.py': 'python', '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
      '.cs': 'csharp', '.php': 'php', '.go': 'go', '.rb': 'ruby', '.swift': 'swift',
      '.kt': 'kotlin', '.rs': 'rust', '.vue': 'vue', '.svelte': 'svelte'
    };
    language = extToLang[ext] || 'javascript'; 
  }

  
  if (['javascript', 'react', 'typescript', 'node_js'].includes(language)) {
    // Match all import statements (ES6 and CommonJS)
    // Updated regex to capture more import patterns including default imports
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1] || match[2]; // ES6 import or require()
      if (!importPath) continue;
      
      // Skip node_modules and standard library imports (single word packages)
      if (importPath.startsWith('node_modules/') || 
          (!importPath.includes('/') && !importPath.startsWith('@') && !importPath.startsWith('.') && !importPath.startsWith('/'))) {
        // Likely a node_modules package (e.g., 'react', 'lodash')
        continue;
      }
      
      // Include all types: relative (./, ../), alias (@/), and absolute paths
      if (importPath.startsWith('./') || 
          importPath.startsWith('../') || 
          importPath.startsWith('@/') || 
          importPath.startsWith('@') ||
          importPath.startsWith('/') ||
          (importPath.includes('/') && !importPath.startsWith('http'))) {
        imports.push(importPath);
        console.log(`Found import in ${currentFilePath}: ${importPath}`);
      }
    }
    
    console.log(`Extracted ${imports.length} imports from ${currentFilePath} (language: ${language})`);
  }
  
  
  else if (language === 'java') {
    // Extract package declaration from current file
    const packageMatch = content.match(/package\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*;/);
    const currentPackage = packageMatch ? packageMatch[1] : null;
    
    // Extract all imports
    const importRegex = /import\s+(?:static\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)(?:\.\*)?\s*;/g;
    let match;
    
    // Standard Java library packages to exclude (only core Java libraries)
    const standardPackages = [
      'java.',           // java.lang, java.util, etc.
      'javax.',          // javax.swing, javax.servlet, etc.
      'sun.',            // sun.misc, etc.
      'com.sun.',        // com.sun.*
      'org.w3c.',        // org.w3c.dom, etc.
      'org.xml.',        // org.xml.sax, etc.
      'org.omg.',        // org.omg.CORBA, etc.
      'org.ietf.',       // org.ietf.jgss, etc.
      'org.jcp.',        // org.jcp.xml.dsig, etc.
    ];
    
    // Common third-party libraries that we might want to exclude (optional)
    // But we'll include them since they might be project dependencies
    // const thirdPartyPackages = ['junit.', 'org.junit.', 'org.testng.', 'org.mockito.'];
    
    let totalImportsFound = 0;
    while ((match = importRegex.exec(content)) !== null) {
      totalImportsFound++;
      const importPath = match[1];
      const fullMatch = match[0];
      
      console.log(`Java import found: ${fullMatch} -> package: ${importPath}`);
      
      // Skip only standard Java library packages
      const isStandardPackage = standardPackages.some(stdPkg => importPath.startsWith(stdPkg));
      if (isStandardPackage) {
        console.log(`  -> Skipped (standard library): ${importPath}`);
        continue;
      }
      
      // Convert package to file path: com.example.MyClass -> com/example/MyClass.java
      // For wildcard imports (com.example.*), we'll try to find the package directory
      const isWildcard = match[0].includes('.*');
      
      if (isWildcard) {
        // For wildcard imports, try to find package directory
        const packagePath = importPath.replace(/\./g, '/');
        imports.push(packagePath); // Will search for files in this directory
        console.log(`  -> Added (wildcard): ${packagePath}`);
      } else {
        // Regular import: convert package.class to file path
        const filePath = importPath.replace(/\./g, '/') + '.java';
        imports.push(filePath);
        console.log(`  -> Added (regular): ${filePath}`);
      }
    }
    
    console.log(`Java file ${currentFilePath}: Found ${totalImportsFound} total imports, ${imports.length} non-standard imports`, imports);
    if (imports.length === 0 && totalImportsFound > 0) {
      console.warn(`Java file ${currentFilePath}: All ${totalImportsFound} imports were standard library imports (filtered out)`);
    } else if (imports.length === 0) {
      console.warn(`Java file ${currentFilePath}: No imports found. Content preview:`, content.substring(0, 500));
    }
  }
  
  
  else if (language === 'python') {
    // Relative imports (from .module import ... or from ..module import ...)
    const relativeImportRegex = /from\s+([.]+[a-zA-Z0-9_.]*)\s+import\s+/g;
    let match;
    while ((match = relativeImportRegex.exec(content)) !== null) {
      const importPath = match[1];
      const dots = importPath.match(/^\.+/)[0].length;
      const modulePath = importPath.replace(/^\.+/, '').replace(/\./g, '/');
      imports.push(modulePath ? `${'../'.repeat(dots - 1)}${modulePath}.py` : '../'.repeat(dots));
    }
    
    const relativeImportRegex2 = /import\s+([.]+[a-zA-Z0-9_.]+)/g;
    while ((match = relativeImportRegex2.exec(content)) !== null) {
      const importPath = match[1];
      const dots = importPath.match(/^\.+/)[0].length;
      const modulePath = importPath.replace(/^\.+/, '').replace(/\./g, '/');
      imports.push(modulePath ? `${'../'.repeat(dots - 1)}${modulePath}.py` : '../'.repeat(dots));
    }
    
    // Absolute imports (from package.module import ... or import package.module)
    // Skip standard library and third-party packages (those without /)
    const absoluteImportRegex = /(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g;
    while ((match = absoluteImportRegex.exec(content)) !== null) {
      const importPath = match[1];
      // Skip if it's a single word (likely standard library or third-party package)
      // Only include if it contains dots (package.module) or slashes
      if (importPath.includes('.') && !importPath.startsWith('.')) {
        // Convert package.module to package/module.py
        const filePath = importPath.replace(/\./g, '/') + '.py';
        imports.push(filePath);
      }
    }
  }
  
  
  else if (['c', 'cpp'].includes(language)) {
    
    const includeRegex = /#include\s+["<]([^">]+)[">]/g;
    let match;
    while ((match = includeRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      if (match[0].includes('"')) {
        imports.push(importPath);
      }
    }
  }
  
  
  else if (language === 'csharp') {
    
    
    const usingRegex = /using\s+([a-zA-Z_][a-zA-Z0-9_.]*);/g;
    let match;
    while ((match = usingRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      
      if (!importPath.startsWith('System.') && !importPath.startsWith('Microsoft.') &&
          !importPath.startsWith('UnityEngine.') && !importPath.startsWith('Unity.')) {
        const filePath = importPath.replace(/\./g, '/') + '.cs';
        imports.push(filePath);
      }
    }
  }
  
  
  else if (language === 'go') {
    
    
    const importRegex = /import\s+(?:\w+\s+)?["']([^"']+)["']/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        imports.push(importPath);
      }
    }
  }
  
  
  else if (language === 'ruby') {
    
    const requireRegex = /require(?:_relative)?\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      const importPath = match[1];
      imports.push(importPath);
    }
  }
  
  
  else if (language === 'php') {
    
    const requireRegex = /(?:require|include)(?:_once)?\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        imports.push(importPath);
      }
    }
  }
  
  
  else if (language === 'rust') {
    
    const useRegex = /use\s+(?:crate|super|self)::([a-zA-Z0-9_::]+);/g;
    let match;
    while ((match = useRegex.exec(content)) !== null) {
      const importPath = match[1].replace(/::/g, '/');
      imports.push(importPath);
    }
  }
  
  
  else if (language === 'swift') {
    
    
    const importRegex = /import\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const moduleName = match[1];
      
      imports.push(`${moduleName}.swift`);
    }
  }
  
  
  else if (language === 'kotlin') {
    
    const importRegex = /import\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      if (!importPath.startsWith('kotlin.') && !importPath.startsWith('java.') &&
          !importPath.startsWith('android.')) {
        const filePath = importPath.replace(/\./g, '/') + '.kt';
        imports.push(filePath);
      }
    }
  }

  return imports;
};


const resolvePath = (basePath, relativePath) => {
  const baseParts = basePath ? basePath.split('/').filter(Boolean) : [];
  const relativeParts = relativePath.split('/').filter(Boolean);
  
  const result = [...baseParts];
  for (const part of relativeParts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }
  
  return result.join('/');
};


const getFileContentFromGitHub = async (octokit, owner, repo, branch, filePath) => {
  try {
    const { data: contentData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });

    if (contentData.type === 'file' && contentData.content) {
      return Buffer.from(contentData.content, "base64").toString("utf-8");
    }
    return null;
  } catch (error) {
    console.error(`Error fetching file content for ${filePath}:`, error);
    return null;
  }
};


const getFileExtension = (filePath) => {
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  return ext;
};


const getPossibleExtensions = (language) => {
  const extMap = {
    'javascript': ['.js', '.jsx', '.mjs', '.cjs'],
    'react': ['.jsx', '.tsx', '.js'],
    'typescript': ['.ts', '.tsx'],
    'java': ['.java'],
    'python': ['.py', '.pyw'],
    'c': ['.c', '.h'],
    'cpp': ['.cpp', '.cc', '.cxx', '.hpp', '.h'],
    'csharp': ['.cs'],
    'php': ['.php', '.phtml'],
    'go': ['.go'],
    'ruby': ['.rb', '.rbw'],
    'swift': ['.swift'],
    'kotlin': ['.kt', '.kts'],
    'rust': ['.rs'],
    'vue': ['.vue'],
    'svelte': ['.svelte']
  };
  return extMap[language] || ['.js', '.jsx', '.ts', '.tsx'];
};


const processImportsRecursively = async (
  octokit,
  owner,
  repo,
  branch,
  filePath,
  allRepoFiles,
  visitedFiles,
  language = null,
  depth = 0,
  maxDepth = 5  // Limit depth to 5 levels for performance (was 20)
) => {
  
  if (visitedFiles.has(filePath) || depth > maxDepth) {
    if (depth > maxDepth) {
      console.log(`Max depth ${maxDepth} reached for ${filePath}`);
    }
    return null;
  }

  visitedFiles.add(filePath);

  
  const content = await getFileContentFromGitHub(octokit, owner, repo, branch, filePath);
  if (!content) {
    return null;
  }

  
  if (!language) {
    const ext = getFileExtension(filePath);
    const extToLang = {
      '.js': 'javascript', '.jsx': 'react', '.ts': 'typescript', '.tsx': 'react',
      '.java': 'java', '.py': 'python', '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
      '.cs': 'csharp', '.php': 'php', '.go': 'go', '.rb': 'ruby', '.swift': 'swift',
      '.kt': 'kotlin', '.rs': 'rust', '.vue': 'vue', '.svelte': 'svelte'
    };
    language = extToLang[ext] || 'javascript';
  }

  
  const relativeImports = extractRelativeImports(content, filePath, language);
  if (relativeImports.length === 0) {
    // Even if no imports found, return the file itself so it can be added to tree
    // This is especially important for Java files that might only have standard library imports
    console.log(`No relative imports found in ${filePath} (language: ${language}). Returning file itself.`);
    return {
      path: filePath,
      imports: []
    };
  }

  const currentDir = filePath.substring(0, filePath.lastIndexOf('/'));
  const children = [];
  const possibleExtensions = getPossibleExtensions(language);

  
  for (const relativeImport of relativeImports) {
    let resolvedPath;
    let possiblePaths = [];
    
    // Handle alias imports (@/ or @) - convert to src/ path
    if (relativeImport.startsWith('@/')) {
      const withoutAlias = relativeImport.slice(2);
      const cleanPath = withoutAlias.replace(/\/$/, ''); // Remove trailing slash
      
      // Try src/ prefix and without prefix
      possiblePaths.push(`src/${cleanPath}`);
      possiblePaths.push(cleanPath);
      
      // Check if path already has an extension
      const hasExtension = /\.(tsx?|jsx?|mjs|cjs)$/i.test(cleanPath);
      
      if (!hasExtension) {
        // Add extensions - prioritize .jsx for React files
        if (['javascript', 'react', 'typescript', 'node_js'].includes(language)) {
          // For React/JS, prioritize .jsx and .tsx
          possiblePaths.push(`src/${cleanPath}.jsx`, `src/${cleanPath}.tsx`, 
                            `src/${cleanPath}.js`, `src/${cleanPath}.ts`);
          possiblePaths.push(`${cleanPath}.jsx`, `${cleanPath}.tsx`, 
                            `${cleanPath}.js`, `${cleanPath}.ts`);
        } else {
          // For other languages, use possibleExtensions
          for (const ext of possibleExtensions) {
            possiblePaths.push(`src/${cleanPath}${ext}`);
            possiblePaths.push(`${cleanPath}${ext}`);
          }
        }
        
        // Add index files for JS/TS
        if (['javascript', 'react', 'typescript', 'node_js'].includes(language)) {
          possiblePaths.push(`src/${cleanPath}/index.jsx`, `src/${cleanPath}/index.tsx`, 
                            `src/${cleanPath}/index.js`, `src/${cleanPath}/index.ts`);
          possiblePaths.push(`${cleanPath}/index.jsx`, `${cleanPath}/index.tsx`, 
                            `${cleanPath}/index.js`, `${cleanPath}/index.ts`);
        }
      } else {
        // Path already has extension, use as-is and also try without extension
        possiblePaths.push(`src/${cleanPath}`);
        possiblePaths.push(cleanPath);
        const pathWithoutExt = cleanPath.replace(/\.(tsx?|jsx?|mjs|cjs)$/i, '');
        possiblePaths.push(`src/${pathWithoutExt}`);
        possiblePaths.push(pathWithoutExt);
      }
      
      console.log(`@/ alias import: ${relativeImport} -> generated ${possiblePaths.length} possible paths`);
    }
    // Handle other alias imports (@package)
    else if (relativeImport.startsWith('@') && !relativeImport.startsWith('@/')) {
      const withoutAlias = relativeImport.slice(1);
      const cleanPath = withoutAlias.replace(/\/$/, '');
      
      possiblePaths.push(`src/${cleanPath}`);
      possiblePaths.push(cleanPath);
      
      const hasExtension = /\.(tsx?|jsx?|mjs|cjs)$/i.test(cleanPath);
      
      if (!hasExtension) {
        if (['javascript', 'react', 'typescript', 'node_js'].includes(language)) {
          possiblePaths.push(`src/${cleanPath}.jsx`, `src/${cleanPath}.tsx`, 
                            `src/${cleanPath}.js`, `src/${cleanPath}.ts`);
          possiblePaths.push(`${cleanPath}.jsx`, `${cleanPath}.tsx`, 
                            `${cleanPath}.js`, `${cleanPath}.ts`);
        } else {
          for (const ext of possibleExtensions) {
            possiblePaths.push(`src/${cleanPath}${ext}`);
            possiblePaths.push(`${cleanPath}${ext}`);
          }
        }
      }
      
      console.log(`@ alias import: ${relativeImport} -> generated ${possiblePaths.length} possible paths`);
    }
    // Handle absolute paths starting with /
    else if (relativeImport.startsWith('/')) {
      const withoutSlash = relativeImport.slice(1);
      possiblePaths.push(withoutSlash);
      for (const ext of possibleExtensions) {
        if (!withoutSlash.endsWith(ext)) {
          possiblePaths.push(`${withoutSlash}${ext}`);
        }
      }
      if (['javascript', 'react', 'typescript', 'node_js'].includes(language)) {
        possiblePaths.push(`${withoutSlash}/index.tsx`, `${withoutSlash}/index.ts`, 
                          `${withoutSlash}/index.jsx`, `${withoutSlash}/index.js`);
      }
    }
    // Java has special handling - package paths are relative to source root
    else if (language === 'java') {
      // Java import path is already in package format (com/example/MyClass.java)
      // We need to search in common Java source directories
      const javaSourceRoots = [
        'src/main/java/',
        'src/test/java/',
        'src/',
        '' // root directory
      ];
      
      // Get the directory of current file to determine source root
      const currentFileDir = filePath.substring(0, filePath.lastIndexOf('/'));
      
      // Try to detect source root from current file path
      let detectedSourceRoot = '';
      if (currentFileDir.includes('src/main/java/')) {
        detectedSourceRoot = currentFileDir.substring(0, currentFileDir.indexOf('src/main/java/') + 'src/main/java/'.length);
      } else if (currentFileDir.includes('src/test/java/')) {
        detectedSourceRoot = currentFileDir.substring(0, currentFileDir.indexOf('src/test/java/') + 'src/test/java/'.length);
      } else if (currentFileDir.includes('src/')) {
        detectedSourceRoot = currentFileDir.substring(0, currentFileDir.indexOf('src/') + 'src/'.length);
      }
      
      // Build possible paths for Java files
      for (const sourceRoot of detectedSourceRoot ? [detectedSourceRoot, ...javaSourceRoots] : javaSourceRoots) {
        const fullPath = sourceRoot + relativeImport;
        possiblePaths.push(fullPath);
        // Also try without .java extension (for package directories)
        if (relativeImport.endsWith('.java')) {
          possiblePaths.push(fullPath.replace(/\.java$/, ''));
        }
      }
      
      // Also try relative to current file's directory (for same-package imports)
      resolvedPath = resolvePath(currentDir, relativeImport);
      possiblePaths.push(resolvedPath);
      if (!resolvedPath.endsWith('.java')) {
        possiblePaths.push(resolvedPath + '.java');
      }
    } else {
      // For other languages, handle relative, absolute, and alias paths
      if (relativeImport.startsWith('./') || relativeImport.startsWith('../')) {
        // Relative path - resolve from current directory
        resolvedPath = resolvePath(currentDir, relativeImport);
        const cleanResolvedPath = resolvedPath.replace(/\/$/, ''); // Remove trailing slash
        
        // Check if path already has an extension
        const hasExtension = /\.(tsx?|jsx?|mjs|cjs)$/i.test(cleanResolvedPath);
        
        if (!hasExtension) {
          possiblePaths = [cleanResolvedPath];
          
          // For React/JS, prioritize .jsx and .tsx
          if (['javascript', 'react', 'typescript', 'node_js'].includes(language)) {
            possiblePaths.push(
              `${cleanResolvedPath}.jsx`,
              `${cleanResolvedPath}.tsx`,
              `${cleanResolvedPath}.js`,
              `${cleanResolvedPath}.ts`
            );
          } else {
            // Add extensions if not already present
            for (const ext of possibleExtensions) {
              possiblePaths.push(`${cleanResolvedPath}${ext}`);
            }
          }
          
          // Language-specific index files
          if (['javascript', 'react', 'typescript', 'node_js'].includes(language)) {
            possiblePaths.push(
              `${cleanResolvedPath}/index.jsx`,
              `${cleanResolvedPath}/index.tsx`,
              `${cleanResolvedPath}/index.js`,
              `${cleanResolvedPath}/index.ts`
            );
          } else if (language === 'python') {
            possiblePaths.push(
              `${cleanResolvedPath}/__init__.py`
            );
          }
        } else {
          // Path already has extension, use as-is
          possiblePaths = [cleanResolvedPath];
        }
      } else if (language === 'python' && relativeImport.includes('/')) {
        // Python absolute import (package/module.py format)
        possiblePaths.push(relativeImport);
        // Also try without .py extension
        if (relativeImport.endsWith('.py')) {
          possiblePaths.push(relativeImport.replace(/\.py$/, ''));
        } else {
          possiblePaths.push(`${relativeImport}.py`);
        }
        // Try __init__.py
        possiblePaths.push(`${relativeImport}/__init__.py`);
      } else {
        // Fallback: try as relative path
        resolvedPath = resolvePath(currentDir, relativeImport);
        possiblePaths = [resolvedPath];
        
        // Add extensions if not already present
        for (const ext of possibleExtensions) {
          if (!resolvedPath.endsWith(ext)) {
            possiblePaths.push(`${resolvedPath}${ext}`);
          }
        }
      }
    }

    
    // Normalize all repo files once for better performance
    const normalizedRepoFiles = allRepoFiles.map(file => ({
      original: file,
      normalized: file.replace(/\\/g, '/').toLowerCase()
    }));
    
    const matchingFile = normalizedRepoFiles.find(({ original, normalized: normalizedRepoFile }) => {
      // For Java, we need exact match or ends with the path
      if (language === 'java') {
        return possiblePaths.some(path => {
          const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
          
          // Exact match (case-insensitive)
          if (normalizedRepoFile === normalizedPath) {
            console.log(`Java: Exact match found: ${original} === ${path}`);
            return true;
          }
          
          // Ends with path (for nested structures)
          if (normalizedRepoFile.endsWith('/' + normalizedPath) || normalizedRepoFile.endsWith(normalizedPath)) {
            console.log(`Java: Ends with match: ${original} ends with ${path}`);
            return true;
          }
          
          // For package directories (without .java), check if any .java file is inside
          if (!normalizedPath.endsWith('.java')) {
            if (normalizedRepoFile.startsWith(normalizedPath + '/') && normalizedRepoFile.endsWith('.java')) {
              console.log(`Java: Package directory match: ${original} in ${path}`);
              return true;
            }
          }
          
          return false;
        });
      } else {
        // For JS/TS/React files, use case-insensitive matching and prioritize .jsx
        return possiblePaths.some(path => {
          const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
          
          // Exact match (case-insensitive)
          if (normalizedRepoFile === normalizedPath) {
            return true;
          }
          
          // Ends with path (case-insensitive)
          if (normalizedRepoFile.endsWith('/' + normalizedPath) || normalizedRepoFile.endsWith(normalizedPath)) {
            return true;
          }
          
          // For .jsx files, also try matching without extension
          if (normalizedPath.endsWith('.jsx')) {
            const pathWithoutExt = normalizedPath.replace(/\.jsx$/, '');
            const repoFileWithoutExt = normalizedRepoFile.replace(/\.(jsx?|tsx?)$/, '');
            if (repoFileWithoutExt === pathWithoutExt || 
                normalizedRepoFile.endsWith('/' + pathWithoutExt) ||
                normalizedRepoFile.endsWith(pathWithoutExt)) {
              return true;
            }
          }
          
          return false;
        });
      }
    })?.original; // Return the original file path
    
    if (!matchingFile) {
      console.log(`No matching file found for import: ${relativeImport} (language: ${language})`);
      console.log(`Searched ${possiblePaths.length} possible paths:`, possiblePaths.slice(0, 10));
      if (possiblePaths.length > 10) {
        console.log(`... and ${possiblePaths.length - 10} more paths`);
      }
      // Log some available files for debugging
      const sampleFiles = allRepoFiles
        .filter(f => {
          const lower = f.toLowerCase();
          const importLower = relativeImport.toLowerCase();
          return lower.includes(importLower.split('/').pop() || '') || 
                 lower.includes(importLower.replace('@/', '').replace('@', '').split('/').pop() || '');
        })
        .slice(0, 5);
      if (sampleFiles.length > 0) {
        console.log(`Sample available files that might match:`, sampleFiles);
      }
    } else {
      console.log(`✓ Found matching file for import "${relativeImport}": ${matchingFile}`);
    }

    if (matchingFile && !visitedFiles.has(matchingFile)) {
      try {
        console.log(`Processing child import: ${matchingFile} (depth: ${depth + 1})`);
        const childTree = await processImportsRecursively(
          octokit,
          owner,
          repo,
          branch,
          matchingFile,
          allRepoFiles,
          visitedFiles,
          language, 
          depth + 1,
          5  // Max depth: 5 levels
        );

        if (childTree) {
          children.push(childTree);
          console.log(`✓ Added child tree for ${matchingFile} with ${childTree.imports?.length || 0} imports`);
        } else {
          console.log(`⚠ Child tree is null for ${matchingFile}`);
        }
      } catch (error) {
        console.error(`Error processing child import ${matchingFile}:`, error);
        // Continue processing other imports even if one fails
        // Add the file itself as a leaf node if processing fails
        children.push({
          path: matchingFile,
          imports: []
        });
      }
    } else if (matchingFile && visitedFiles.has(matchingFile)) {
      console.log(`⚠ Skipping already visited file: ${matchingFile}`);
    }
  }

  return {
    path: filePath,
    imports: children
  };
};


const getRepositoryImportTree = async (req, res) => {
  const { userId, uid, repoFullName, branch, entryFiles, language } = req.body;

  if (!userId || !repoFullName || !branch || !entryFiles) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: userId, repoFullName, branch, entryFiles",
      status: 400,
    });
  }

  if (!Array.isArray(entryFiles) || entryFiles.length === 0) {
    return res.status(400).json({
      success: false,
      error: "entryFiles must be a non-empty array",
      status: 400,
    });
  }

  try {
    
    
    console.log("Processing import tree request:", { 
      userId, 
      repoFullName, 
      branch, 
      entryFilesCount: entryFiles?.length 
    });

    const token = await getGitHubToken(userId, uid);
    const octokit = new Octokit({ auth: token });

    if (!repoFullName || !repoFullName.includes("/")) {
      return res.status(400).json({
        success: false,
        error: "Invalid repoFullName format. Expected: owner/repo",
        status: 400,
      });
    }

    const [owner, repo] = repoFullName.split("/");
    
    if (!owner || !repo) {
      return res.status(400).json({
        success: false,
        error: "Invalid repoFullName format. Could not parse owner/repo",
        status: 400,
      });
    }

    
    const { data: rateData } = await octokit.rest.rateLimit.get();
    if (rateData.rate.remaining === 0) {
      return res.status(403).json({
        success: false,
        error: "GitHub API rate limit exceeded. Please wait and try again later.",
        resetAt: new Date(rateData.rate.reset * 1000).toISOString(),
        status: 403,
      });
    }

    
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    
    const { data: treeData } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: refData.object.sha,
      recursive: true,
    });

    
    const allRepoFiles = treeData.tree
      .filter((item) => item.type === "blob")
      .map((file) => file.path);

    
    const trees = [];
    
    const visitedFiles = new Set();

    
    let detectedLanguage = language;
    if (!detectedLanguage && entryFiles.length > 0) {
      const firstFile = entryFiles[0];
      const ext = getFileExtension(firstFile);
      const extToLang = {
        '.js': 'javascript', '.jsx': 'react', '.ts': 'typescript', '.tsx': 'react',
        '.java': 'java', '.py': 'python', '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
        '.cs': 'csharp', '.php': 'php', '.go': 'go', '.rb': 'ruby', '.swift': 'swift',
        '.kt': 'kotlin', '.rs': 'rust', '.vue': 'vue', '.svelte': 'svelte'
      };
      detectedLanguage = extToLang[ext] || 'javascript';
    }

    console.log(`Processing import tree with language: ${detectedLanguage || 'auto-detect'}`);

    for (const entryFile of entryFiles) {
      if (!allRepoFiles.includes(entryFile)) {
        console.warn(`Entry file not found in repo: ${entryFile}`);
        continue;
      }

      try {
        const tree = await processImportsRecursively(
          octokit,
          owner,
          repo,
          branch,
          entryFile,
          allRepoFiles,
          visitedFiles,
          detectedLanguage, 
          0,
          5  // Max depth: 5 levels for better performance
        );

        if (tree) {
          // Include the entry file itself in the tree structure
          // This way frontend can add entry file and recursively add all its imports
          trees.push({
            entry: entryFile,
            tree: tree, // Full tree including entry file path and its imports
            imports: tree.imports || [] // For backward compatibility
          });
        }
      } catch (error) {
        console.error(`Error processing entry file ${entryFile}:`, error);
        
      }
    }

    return res.status(200).json({
      success: true,
      trees,
      entryFiles,
      repoFullName,
      branch,
      rateRemaining: rateData.rate.remaining,
      status: 200,
    });
  } catch (error) {
    console.error("GitHub Import Tree Error:", error);
    console.error("Error stack:", error.stack);
    console.error("Error details:", {
      message: error.message,
      status: error.status,
      response: error.response?.data,
    });

    const status = error.status || 500;
    const message =
      error.response?.data?.message || error.message || "Failed to analyze imports";

    return res.status(status).json({
      success: false,
      error: message,
      details: error.response?.data,
      errorMessage: error.message,
      status,
    });
  }
};

export default getRepositoryImportTree;

