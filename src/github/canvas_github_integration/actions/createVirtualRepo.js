import { db } from "../../../../config/firebase.js";
import { Octokit } from "octokit";
import { nanoid } from 'nanoid';
import { GetCurrentDateTime } from "../../../../utility/CommonUtils.js";
import { FieldValue } from "firebase-admin/firestore";

const getGitHubToken = async (userId, uid = null) => {
  if (!userId && !uid) {
    throw new Error("userId or uid is required");
  }
  
  let doc = null;
  
  if (userId) {
    const githubIdStr = String(userId).trim();
    doc = await db.collection("user_tokens").doc(githubIdStr).get();
    if (!doc.exists) {
      
      if (!isNaN(githubIdStr)) {
        const numId = parseInt(githubIdStr, 10);
        doc = await db.collection("user_tokens").doc(String(numId)).get();
        
        if (!doc.exists) {
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
  
  // If userId didn't work, try to find token via user_githubs using uid
  // This is the PRIMARY method if userId direct lookup fails
  if (uid) {
    console.log(`Token not found with direct userId lookup, trying to find via user_githubs with uid: ${uid}...`);
    
    const userGithubsDoc = await db.collection("user_githubs").doc(uid).get();
    
    if (userGithubsDoc.exists) {
      const userData = userGithubsDoc.data();
      console.log(`Found user_githubs document for uid: ${uid}`, {
        github_ids: userData.github_ids,
        github_ids_length: userData.github_ids?.length,
        github_ids_types: userData.github_ids?.map(id => ({ id, type: typeof id }))
      });
      
      if (userData.github_ids && Array.isArray(userData.github_ids) && userData.github_ids.length > 0) {
        // First, try to find the exact userId in the array
        const requestedIdStr = userId ? String(userId).trim() : null;
        if (requestedIdStr) {
          const matchingId = userData.github_ids.find(id => String(id).trim() === requestedIdStr);
          if (matchingId) {
            const githubIdToTry = String(matchingId).trim();
            console.log(`Found matching githubId in user_githubs array: ${githubIdToTry}`);
            doc = await db.collection("user_tokens").doc(githubIdToTry).get();
            if (doc.exists) {
              const tokenData = doc.data();
              if (tokenData && tokenData.accessToken) {
                console.log(`Found token with matching githubId from user_githubs: ${githubIdToTry}`);
                return tokenData.accessToken;
              }
            }
          }
        }
        
        // If exact match not found, try all githubIds from the array
        console.log(`Exact match not found, trying all githubIds from user_githubs array...`);
        for (const githubIdFromArray of userData.github_ids) {
          const githubIdToTry = String(githubIdFromArray).trim();
          console.log(`Trying githubId from user_githubs: ${githubIdToTry}`);
          
          doc = await db.collection("user_tokens").doc(githubIdToTry).get();
          if (doc.exists) {
            const tokenData = doc.data();
            if (tokenData && tokenData.accessToken) {
              console.log(`Found token with githubId from user_githubs: ${githubIdToTry}`);
              // Verify this token belongs to the requested userId if possible
              if (requestedIdStr && githubIdToTry === requestedIdStr) {
                console.log(`Verified: Token belongs to requested userId ${requestedIdStr}`);
              }
              return tokenData.accessToken;
            }
          } else {
            console.log(`Token document not found for githubId: ${githubIdToTry}`);
          }
        }
      } else {
        console.log(`user_githubs document exists but github_ids array is empty or missing`);
      }
    } else {
      console.log(`user_githubs document not found for uid: ${uid}`);
    }
  }
  
  // Last resort: Search ALL user_githubs documents for the requested githubId
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
          for (const githubIdFromArray of userData.github_ids) {
            const githubIdToTry = String(githubIdFromArray).trim();
            doc = await db.collection("user_tokens").doc(githubIdToTry).get();
            if (doc.exists) {
              const tokenData = doc.data();
              if (tokenData && tokenData.accessToken) {
                return tokenData.accessToken;
              }
            }
          }
        }
      }
    }
  }
  if (uid) {
    const userGithubsDoc = await db.collection("user_githubs").doc(uid).get();
    
    if (userGithubsDoc.exists) {
      const userData = userGithubsDoc.data();
      if (userData.github_ids && Array.isArray(userData.github_ids) && userData.github_ids.length > 0) {
        const firstGithubId = String(userData.github_ids[0]).trim();
        doc = await db.collection("user_tokens").doc(firstGithubId).get();
        if (doc.exists) {
          const tokenData = doc.data();
          if (tokenData && tokenData.accessToken) {
            return tokenData.accessToken;
          }
        }
      }
    }
  }
  if (userId) {
    const requestedIdStr = String(userId).trim();
    const allTokens = await db.collection("user_tokens").get()
    for (const tokenDoc of allTokens.docs) {
      const tokenData = tokenDoc.data();
      if (!tokenData || !tokenData.accessToken) {
        continue;
      }
      
      try {
        const testOctokit = new Octokit({ auth: tokenData.accessToken });
        const { data: user } = await testOctokit.rest.users.getAuthenticated();
        const tokenUserId = user.id.toString();
        if (tokenUserId === requestedIdStr) { 
          return tokenData.accessToken;
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  const allTokensForError = await db.collection("user_tokens").get();
  const availableIds = allTokensForError.docs.map(d => ({ id: d.id, type: typeof d.id }));
  
  throw new Error(`GitHub token not found for userId: ${userId || 'N/A'}. Please authenticate with GitHub first.`);
};

const getFileContent = async (octokit, owner, repo, branch, path) => {
  try {
    const { data: contentData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    const buffer = Buffer.from(contentData.content, "base64");
    return buffer.toString("utf-8");
  } catch (error) {
    console.error(`Failed to get file content for ${path}:`, error.message);
    return null;
  }
};

// Count lines of code in a file
const countLines = (content) => {
  if (!content) return 0;
  return content.split("\n").length;
};

// Utility functions for discovering imports
const normalizePath = (value) => {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
};

const resolveRelativePath = (fromPath, importPath) => {
  const fromParts = normalizePath(fromPath).split("/");
  fromParts.pop(); // remove file name
  const importParts = normalizePath(importPath).split("/");

  for (const part of importParts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      fromParts.pop();
    } else {
      fromParts.push(part);
    }
  }

  return fromParts.join("/");
};

const buildCandidatePaths = (importPath, fromFile) => {
  const candidates = new Set();
  const addVariants = (base) => {
    const cleanBase = normalizePath(base);
    [
      cleanBase,
      `${cleanBase}.tsx`,
      `${cleanBase}.ts`,
      `${cleanBase}.jsx`,
      `${cleanBase}.js`,
      `${cleanBase}/index.tsx`,
      `${cleanBase}/index.ts`,
      `${cleanBase}/index.jsx`,
      `${cleanBase}/index.js`,
    ].forEach((item) => candidates.add(item));
  };

  if (importPath.startsWith(".")) {
    addVariants(resolveRelativePath(fromFile, importPath));
  } else if (importPath.startsWith("@/")) {
    const withoutAlias = importPath.slice(2);
    addVariants(`src/${withoutAlias}`);
    addVariants(withoutAlias);
  } else if (importPath.startsWith("@")) {
    const withoutAlias = importPath.slice(1);
    addVariants(`src/${withoutAlias}`);
    addVariants(withoutAlias);
  } else {
    addVariants(importPath);
    addVariants(`src/${importPath}`);
  }

  return Array.from(candidates);
};

const extractImportSpecifiers = (source) => {
  const matches = new Set();
  const importRegex =
    /import\s+(?:[^'"]+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    const specifier = match[1] || match[2];
    if (specifier) {
      // Skip node_modules imports
      if (!specifier.startsWith('.') && !specifier.startsWith('@') && !specifier.startsWith('/')) {
        continue;
      }
      matches.add(specifier.trim());
    }
  }
  return Array.from(matches);
};

// Fetch all files from a repository
const fetchRepoFiles = async (octokit, owner, repo, branch) => {
  try {
    const files = [];
    const fetchRecursive = async (path = '') => {
      try {
        const { data: contents } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: path || undefined,
          ref: branch,
        });

        if (Array.isArray(contents)) {
          for (const item of contents) {
            if (item.type === 'file') {
              files.push({ path: item.path, type: 'file' });
            } else if (item.type === 'dir') {
              await fetchRecursive(item.path);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching files from ${path}:`, error.message);
      }
    };

    await fetchRecursive();
    return files;
  } catch (error) {
    console.error(`Failed to fetch repo files:`, error.message);
    return [];
  }
};

const findMatchingRepoPath = (importPath, entryFile, repoFiles) => {
  const repoFileSet = new Set(repoFiles.map(f => normalizePath(f.path)));
  const candidates = buildCandidatePaths(importPath, entryFile);
  return candidates.find((candidate) => repoFileSet.has(candidate));
};

// Discover imported files from entry files
const discoverCustomImports = async (octokit, owner, repo, branch, entryFiles, repoFiles) => {
  const additionalEntries = new Set();
  const processedFiles = new Set(); // Track processed files to avoid infinite loops

  const processFile = async (filePath) => {
    if (processedFiles.has(normalizePath(filePath))) {
      return; // Already processed
    }
    processedFiles.add(normalizePath(filePath));

    const content = await getFileContent(octokit, owner, repo, branch, filePath);
    if (!content) return;

    const importSpecifiers = extractImportSpecifiers(content);
    for (const specifier of importSpecifiers) {
      const matchedPath = findMatchingRepoPath(specifier, filePath, repoFiles);
      if (matchedPath && !additionalEntries.has(normalizePath(matchedPath))) {
        additionalEntries.add(normalizePath(matchedPath));
        // Recursively process the imported file
        await processFile(matchedPath);
      }
    }
  };

  // Process all entry files
  for (const entryFile of entryFiles) {
    await processFile(entryFile);
  }

  // Remove original entry files from additional entries
  entryFiles.forEach((file) => additionalEntries.delete(normalizePath(file)));
  return Array.from(additionalEntries);
};

// Create a new repository on GitHub
const createRepository = async (octokit, repoName, description = "") => {
  try {
    console.log(`Attempting to create repository: ${repoName}`);
    console.log(`Repository settings: private=true, auto_init=false`);
    
    const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      description: description || `Virtual repository containing selected components`,
      private: true,
      auto_init: false,
    });
    
    console.log(`Repository created successfully via API:`);
    console.log(`  - ID: ${repo.id}`);
    console.log(`  - Name: ${repo.name}`);
    console.log(`  - Full Name: ${repo.full_name}`);
    console.log(`  - Owner: ${repo.owner.login} (${repo.owner.type})`);
    console.log(`  - URL: ${repo.html_url}`);
    console.log(`  - Clone URL: ${repo.clone_url}`);
    
    return repo;
  } catch (error) {
    console.error(`Error creating repository "${repoName}":`, {
      status: error.status,
      message: error.message,
      response: error.response?.data,
    });
    
    if (error.status === 422 && error.response?.data?.errors?.[0]?.message?.includes("already exists")) {
      throw new Error(`Repository "${repoName}" already exists`);
    }
    throw error;
  }
};

// Create or update a file in a repository
const createOrUpdateFile = async (octokit, owner, repo, path, content, message, branch = "main") => {
  try {
    // Try to get the file first to get its SHA (for update)
    let sha = null;
    try {
      const { data: existingFile } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });
      if (existingFile.type === "file") {
        sha = existingFile.sha;
      }
    } catch (error) {
      // File doesn't exist, will create new
    }

    const contentBase64 = Buffer.from(content, "utf-8").toString("base64");

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: contentBase64,
      branch,
      ...(sha && { sha }), // Include SHA if updating
    });

    return true;
  } catch (error) {
    console.error(`Failed to create/update file ${path}:`, error.message);
    throw error;
  }
};

// ==================== FIXED: Generate CRD.md content with proper table format ====================
const generateCRDMarkdown = (components) => {
  let crd = `# Component Relation Diagram (CRD)\n\n`;
  crd += `| No | Tree | Code Line Count | Path | Filename |\n`;
  crd += `|----|------|-----------------|------|----------|\n`;

  // Sort components to maintain consistent order
  const sortedComponents = [...components].sort((a, b) => {
    const pathA = a.pathName || a.githubPath || a.name || '';
    const pathB = b.pathName || b.githubPath || b.name || '';
    return pathA.localeCompare(pathB);
  });

  let totalLines = 0;
  let rowNo = 1;

  sortedComponents.forEach((comp, index) => {
    const name = comp.name || "N/A";
    const lines = comp.lineCount || 0;
    totalLines += lines;
    
    // Get file path - remove leading slash if present
    const getFilePath = (path) => {
      if (!path) return name;
      // Remove leading slash and ensure proper path
      let cleanPath = path.startsWith('/') ? path.substring(1) : path;
      // Don't add ./ prefix, just show the relative path
      return cleanPath;
    };
    
    const filePath = getFilePath(comp.pathName || comp.githubPath || name);
    
    // Get filename from path
    const getFileName = (path) => {
      if (!path) return name;
      const parts = path.split('/');
      return parts[parts.length - 1];
    };
    
    const fileName = getFileName(comp.pathName || comp.githubPath || name);
    
    // Tree column: Just show the filename with proper indentation based on path depth
    const pathDepth = filePath.split('/').length - 1;
    let treePrefix = '';
    if (pathDepth > 0) {
      treePrefix = '  '.repeat(pathDepth) + '└─ ';
    }
    const treeDisplay = treePrefix + fileName;
    
    // Format path with quotes for better readability
    const displayPath = filePath ? `\`./${filePath}\`` : '-';
    
    crd += `| ${rowNo} | ${treeDisplay} | ${lines} | ${displayPath} | ${fileName} |\n`;
    rowNo++;
  });

  crd += `\n**TOTAL CODE LINES | ${totalLines}**\n`;

  return crd;
};

// ==================== FIXED: Generate README.md with proper format ====================
const generateReadme = (components) => {
  let readme = `# Virtual Repository\n\n`;
  readme += `This repository contains selected components from the original repository.\n\n`;
  readme += `## Components\n\n`;
  readme += `| No | Component Name | Code Lines | File Path |\n`;
  readme += `|----|----------------|------------|-----------|\n`;

  // Sort components by path for consistent display
  const sortedComponents = [...components].sort((a, b) => {
    const pathA = a.pathName || a.githubPath || a.name || '';
    const pathB = b.pathName || b.githubPath || b.name || '';
    return pathA.localeCompare(pathB);
  });

  let totalLines = 0;

  sortedComponents.forEach((comp, index) => {
    const name = comp.name || "N/A";
    const lines = comp.lineCount || 0;
    totalLines += lines;
    
    // Get file path - remove leading slash if present
    const getFilePath = (path) => {
      if (!path) return name;
      return path.startsWith('/') ? path.substring(1) : path;
    };
    
    const filePath = getFilePath(comp.pathName || comp.githubPath || name);
    
    readme += `| ${index + 1} | ${name} | ${lines} | \`${filePath}\` |\n`;
  });

  readme += `\n## Total Code Lines\n\n`;
  readme += `**Total:** ${totalLines} lines\n`;

  return readme;
};

// Main handler
const createVirtualRepo = async (req, res) => {
  const { userId, uid, repoName, components, githubToken, projectId, parentRepoFullName, parentRepoName, owner } = req.body;

  // repoName is required, components is optional (can be empty array or undefined)
  if (!repoName) {
    return res.status(400).json({
      success: false,
      error: "Missing required field: repoName",
      status: 400,
    });
  }

  // Ensure components is an array (default to empty array if not provided)
  const componentsArray = Array.isArray(components) ? components : [];

  if (!projectId) {
    return res.status(400).json({
      success: false,
      error: "Missing required field: projectId",
      status: 400,
    });
  }

  try {
    let token;
    if (githubToken) {
      console.log("✅ Using GitHub token provided from frontend (localStorage)");
      token = githubToken;
    } else {
      // Fallback: Firestore'dan al (eğer frontend token göndermezse)
      console.log("⚠️ Token not provided from frontend, attempting to get from Firestore for userId:", userId);
      try {
        token = await getGitHubToken(userId);
      } catch (tokenError) {
        console.error("❌ Failed to get token from Firestore:", tokenError.message);
        return res.status(401).json({
          success: false,
          error: "GitHub token not found. Please authenticate with GitHub first.",
          status: 401,
        });
      }
    }
    
    const octokit = new Octokit({ auth: token });

    // Get authenticated user info
    const { data: user } = await octokit.rest.users.getAuthenticated();
    const authenticatedUserId = user.id.toString();
    const requestedUserId = userId ? String(userId).trim() : null;
    
    // For virtual repos, ALWAYS use "KitGid-Virtual-Repos" organization
    // Never use user account, even if owner is not provided
    const repoOwner = "KitGid-Virtual-Repos";
    const isOrganization = true; // Virtual repos are ALWAYS created in organization
    
    console.log(`Authenticated user: ${user.login} (ID: ${user.id})`);
    console.log(`Requested userId: ${requestedUserId}`);
    console.log(`Authenticated userId: ${authenticatedUserId}`);
    console.log(`Repository owner: ${repoOwner} (Organization: ${isOrganization})`);
    console.log(`Creating virtual repository in organization: ${repoOwner}`);
    
    // Verify that the authenticated user matches the requested userId (if userId is provided)
    if (requestedUserId && authenticatedUserId !== requestedUserId) {
      console.error(`Token mismatch! Authenticated user ID (${authenticatedUserId}) does not match requested userId (${requestedUserId})`);
      throw new Error(`GitHub token belongs to a different user. Expected userId: ${requestedUserId}, but token belongs to: ${authenticatedUserId}`);
    }

    // Create the repository
    console.log(`Creating repository: ${repoName} for owner: ${repoOwner}`);
    let repo;
    
    // Virtual repos must be created in KitGid-Virtual-Repos organization
    if (isOrganization) {
      // First, check if user has access to the organization
      try {
        console.log(`Checking access to organization "${repoOwner}"...`);
        await octokit.rest.orgs.get({ org: repoOwner });
        console.log(`✅ Access to organization "${repoOwner}" confirmed`);
      } catch (accessError) {
        console.error(`❌ Cannot access organization "${repoOwner}":`, accessError.message);
        if (accessError.status === 404) {
          throw new Error(`Organization "${repoOwner}" not found or you don't have access to it.`);
        } else if (accessError.status === 403) {
          throw new Error(`Access denied to organization "${repoOwner}". The organization has OAuth App access restrictions enabled. Please ask an organization owner to authorize this application at: https://github.com/organizations/${repoOwner}/settings/applications`);
        }
        throw new Error(`Cannot access organization "${repoOwner}": ${accessError.message}`);
      }

      // Check if repository already exists, if not create it
      try {
        console.log(`Checking if repository "${repoName}" already exists in organization "${repoOwner}"...`);
        try {
          const { data: existingRepo } = await octokit.rest.repos.get({
            owner: repoOwner,
            repo: repoName,
          });
          repo = existingRepo;
          console.log(`✅ Repository already exists: ${repo.full_name}`);
          console.log(`   URL: ${repo.html_url}`);
        } catch (getError) {
          // Repository doesn't exist, create it
          if (getError.status === 404) {
            console.log(`Repository "${repoName}" does not exist, creating new one...`);
            try {
              const { data: orgRepo } = await octokit.rest.repos.createInOrg({
                org: repoOwner,
                name: repoName,
                description: `Virtual repository containing selected components`,
                private: true,
                auto_init: false, // Create empty repository
              });
              repo = orgRepo;
              console.log(`✅ Repository created successfully in organization: ${repoOwner}`);
              console.log(`   Full name: ${repo.full_name}`);
              console.log(`   URL: ${repo.html_url}`);
            } catch (createError) {
              console.error(`❌ Failed to create repository in organization ${repoOwner}:`, createError.message);
              console.error(`   Error details:`, createError.response?.data || createError);
              
              // Handle specific OAuth App access restriction error
              if (createError.message && createError.message.includes('OAuth App access restrictions')) {
                const errorMessage = `The organization "${repoOwner}" has OAuth App access restrictions enabled. ` +
                  `An organization owner needs to authorize this application. ` +
                  `Please visit: https://github.com/organizations/${repoOwner}/settings/applications ` +
                  `and authorize the application, or contact an organization owner.`;
                throw new Error(errorMessage);
              }
              
              // Handle "name already exists" error - this shouldn't happen after checking, but handle it anyway
              if (createError.status === 422 && createError.response?.data?.errors?.some((e) => e.message?.includes('already exists'))) {
                // Try to get the existing repo one more time
                try {
                  const { data: existingRepo } = await octokit.rest.repos.get({
                    owner: repoOwner,
                    repo: repoName,
                  });
                  repo = existingRepo;
                  console.log(`✅ Repository found after create error: ${repo.full_name}`);
                } catch (finalError) {
                  throw new Error(`Repository "${repoName}" already exists but could not be accessed: ${finalError.message}`);
                }
              } else {
                throw new Error(`Failed to create virtual repository in organization "${repoOwner}": ${createError.message}. Please ensure you have permission to create repositories in this organization.`);
              }
            }
          } else {
            // Some other error when checking for existing repo
            throw new Error(`Failed to check if repository exists: ${getError.message}`);
          }
        }
      } catch (orgError) {
        console.error(`❌ Failed to handle repository in organization ${repoOwner}:`, orgError.message);
        console.error(`   Error details:`, orgError.response?.data || orgError);
        
        // Handle specific OAuth App access restriction error
        if (orgError.message && orgError.message.includes('OAuth App access restrictions')) {
          const errorMessage = `The organization "${repoOwner}" has OAuth App access restrictions enabled. ` +
            `An organization owner needs to authorize this application. ` +
            `Please visit: https://github.com/organizations/${repoOwner}/settings/applications ` +
            `and authorize the application, or contact an organization owner.`;
          throw new Error(errorMessage);
        }
        
        // Don't fallback - virtual repos MUST be in organization
        // Never create virtual repos in user account
        throw new Error(`Failed to create virtual repository in organization "${repoOwner}": ${orgError.message}. Please ensure you have permission to create repositories in this organization.`);
      }
    } else {
      // This should NEVER happen for virtual repos
      // Virtual repos are ALWAYS created in KitGid-Virtual-Repos organization
      throw new Error(`Invalid configuration: Virtual repos must be created in "KitGid-Virtual-Repos" organization, not in user account.`);
    }
    console.log(`Repository created successfully!`);
    console.log(`  - Name: ${repo.name}`);
    console.log(`  - Full Name: ${repo.full_name}`);
    console.log(`  - URL: ${repo.html_url}`);
    console.log(`  - Owner: ${repo.owner.login}`);

    // Process each component (only if components array is provided and not empty)
    const processedComponents = [];
    let allComponentsToProcess = [];
    
    if (componentsArray && componentsArray.length > 0) {
      // First, discover imported files from selected components
      // Group components by repository to fetch files efficiently
      const componentsByRepo = {};
      componentsArray.forEach(comp => {
        if (!comp.githubRepoFullName || !comp.githubPath) return;
        const repoKey = comp.githubRepoFullName;
        if (!componentsByRepo[repoKey]) {
          componentsByRepo[repoKey] = {
            owner: comp.githubRepoFullName.split('/')[0],
            repo: comp.githubRepoFullName.split('/')[1],
            branch: comp.githubBranch || 'main',
            entryFiles: []
          };
        }
        componentsByRepo[repoKey].entryFiles.push(comp.githubPath);
      });

      // Discover imports for each repository
      const discoveredImports = new Set();
      for (const repoKey in componentsByRepo) {
        const repoInfo = componentsByRepo[repoKey];
        try {
          console.log(`Discovering imports from ${repoKey}...`);
          const repoFiles = await fetchRepoFiles(octokit, repoInfo.owner, repoInfo.repo, repoInfo.branch);
          const additionalFiles = await discoverCustomImports(
            octokit,
            repoInfo.owner,
            repoInfo.repo,
            repoInfo.branch,
            repoInfo.entryFiles,
            repoFiles
          );
          
          additionalFiles.forEach(file => {
            const normalizedPath = normalizePath(file);
            discoveredImports.add(JSON.stringify({
              githubRepoFullName: repoKey,
              githubPath: normalizedPath,
              githubBranch: repoInfo.branch
            }));
          });
          
          console.log(`Discovered ${additionalFiles.length} imported files from ${repoKey}`);
        } catch (error) {
          console.error(`Error discovering imports from ${repoKey}:`, error.message);
        }
      }

      // Combine original components with discovered imports
      allComponentsToProcess = [...componentsArray];
      const existingPaths = new Set();
      // Track existing paths from original components
      componentsArray.forEach(comp => {
        if (comp.githubPath) {
          existingPaths.add(normalizePath(comp.githubPath));
        }
        if (comp.pathName) {
          existingPaths.add(normalizePath(comp.pathName));
        }
      });

      discoveredImports.forEach(importStr => {
        const importData = JSON.parse(importStr);
        const normalizedImportPath = normalizePath(importData.githubPath);
        
        // Check if this import is already in the original components
        if (!existingPaths.has(normalizedImportPath)) {
          // Extract filename from path
          const pathParts = importData.githubPath.split('/');
          const fileName = pathParts[pathParts.length - 1];
          allComponentsToProcess.push({
            id: nanoid(), // Generate ID for discovered component
            name: fileName,
            githubRepoFullName: importData.githubRepoFullName,
            githubPath: importData.githubPath,
            githubBranch: importData.githubBranch,
            pathName: importData.githubPath
          });
          existingPaths.add(normalizedImportPath);
        }
      });

      console.log(`Total components to process: ${allComponentsToProcess.length} (${componentsArray.length} original + ${allComponentsToProcess.length - componentsArray.length} discovered)`);
    }

    // Process all components (original + discovered imports)
    if (allComponentsToProcess.length > 0) {
      for (const component of allComponentsToProcess) {
        if (!component.githubRepoFullName || !component.githubPath) {
          console.warn(`Skipping component ${component.name}: missing GitHub info`);
          continue;
        }

        const [sourceOwner, sourceRepo] = component.githubRepoFullName.split("/");
        const branch = component.githubBranch || "main";
        const filePath = component.githubPath;

        // Get file content from source repository
        console.log(`Fetching file: ${filePath} from ${component.githubRepoFullName}`);
        const content = await getFileContent(octokit, sourceOwner, sourceRepo, branch, filePath);

        if (!content) {
          console.warn(`Failed to fetch content for ${filePath}`);
          processedComponents.push({
            ...component,
            lineCount: 0,
            error: "Failed to fetch content",
          });
          continue;
        }

        const lineCount = countLines(content);

        // Create file in new repository - preserve folder structure
        // Use the full path from component, removing leading slash if present
        const getFilePath = (path) => {
          if (!path) return component.name || 'component';
          // Remove leading slash if present
          return path.startsWith('/') ? path.substring(1) : path;
        };
        const filePathInRepo = getFilePath(component.pathName || filePath);
        console.log(`Creating file with folder structure: ${filePathInRepo} in ${repoName}`);
        
        // Ensure parent directories exist by creating them if needed
        // GitHub API will create directories automatically when creating nested files
        await createOrUpdateFile(
          octokit,
          repoOwner,
          repoName,
          filePathInRepo,
          content,
          `Add component: ${component.name}`,
          "main"
        );

        processedComponents.push({
          ...component,
          lineCount,
          pathInRepo: filePathInRepo // Store the path in the new repo
        });
      }
    }

    // ==================== FIXED: Generate and create CRD.md with proper format ====================
    console.log(`Generating documentation files...`);
    
    // Generate and create README.md
    if (processedComponents.length > 0) {
      const readmeContent = generateReadme(processedComponents);
      console.log(`Creating README.md`);
      await createOrUpdateFile(
        octokit,
        repoOwner,
        repoName,
        "README.md",
        readmeContent,
        "Add README with component list",
        "main"
      );

      // ==================== FIXED: Generate and create CRD.md with proper table format ====================
      const crdContent = generateCRDMarkdown(processedComponents);
      console.log(`Creating CRD.md with proper table format`);
      console.log(`CRD.md content preview:\n${crdContent.split('\n').slice(0, 10).join('\n')}...`);
      
      await createOrUpdateFile(
        octokit,
        repoOwner,
        repoName,
        "CRD.md",
        crdContent,
        "Add CRD (Component Relation Diagram) with tree structure",
        "main"
      );
      
      console.log(`✅ CRD.md created successfully in GitHub repository`);
    } else {
      console.log(`⚠️ No components processed, skipping CRD.md creation`);
    }
    
    // Find or create repoId for virtual repo
    let repoId = null;
    try {
      const [finalOwner, repoNameOnly] = repo.full_name.split('/');
      
      // Check if virtual repo already exists in Firestore
      const existingRepos = await db.collection('github_repos')
        .where('owner', '==', finalOwner)
        .where('repo', '==', repoNameOnly)
        .where('type', '==', 'virtual')
        .where('project_id', '==', projectId)
        .limit(1)
        .get();
      
      if (!existingRepos.empty) {
        // Use existing repoId
        repoId = existingRepos.docs[0].id;
        console.log(`Using existing virtual repo ID: ${repoId}`);
        
        // Update existing repo
        await db.collection('github_repos').doc(repoId).update({
          updated_at: GetCurrentDateTime()
        });
      } else {
        // Create new repoId
        repoId = nanoid();
        const permissionData = {
          id: repoId,
          project_id: projectId,
          owner: finalOwner,
          repo: repoNameOnly,
          type: 'virtual',
          is_virtual: true,
          parent_repo_full_name: parentRepoFullName || null,
          parent_repo_name: parentRepoName || null,
          created_at: GetCurrentDateTime(),
          updated_at: GetCurrentDateTime()
        };

        const batch = db.batch();
        
        // 1. Create the repo permission document
        const repoRef = db.collection('github_repos').doc(repoId);
        batch.set(repoRef, permissionData, { merge: true });
        
        // 2. Update the project_repos collection
        const projectReposRef = db.collection('project_repos').doc(projectId);
        batch.set(projectReposRef, { 
          repo_list: FieldValue.arrayUnion(repoId) 
        }, { merge: true });

        await batch.commit();
        console.log(`✅ Virtual repo saved to Firestore with ID: ${repoId}`);
      }

      // Create or update CRD tree structure from components
      if (processedComponents.length > 0 && repoId) {
        try {
          // Helper function to build nested tree structure from paths
          const buildNestedTree = (components) => {
            const rootNodes = {};
            const nodeMap = {}; // Map to track existing nodes by path
            
            components.forEach((comp) => {
              // Use the full path, removing leading slash if present
              const getFilePath = (path) => {
                if (!path) return comp.name || 'component';
                return path.startsWith('/') ? path.substring(1) : path;
              };
              const fullPath = getFilePath(comp.pathName || comp.githubPath || comp.name);
              
              // Extract just the filename for display
              const getFileName = (path) => {
                if (!path) return comp.name || 'component';
                const parts = path.split('/');
                return parts[parts.length - 1];
              };
              const fileName = getFileName(fullPath);
              
              const pathParts = fullPath.split('/').filter(p => p);
              
              // Create folder nodes for each part of the path (except the last one which is the file)
              let currentPath = '';
              let parentNode = null;
              
              for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                const isFile = i === pathParts.length - 1;
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                
                // Check if node already exists
                if (!nodeMap[currentPath]) {
                  const nodeId = isFile ? (comp.id || nanoid()) : nanoid();
                  const node = {
                    id: nodeId,
                    name: part,
                    type: isFile ? 'file' : 'folder',
                    pathName: currentPath,
                    githubPath: currentPath,
                    githubRepoFullName: repo.full_name,
                    githubBranch: comp.githubBranch || 'main',
                    lineCount: isFile ? (comp.lineCount || 0) : 0,
                    children: []
                  };
                  
                  nodeMap[currentPath] = node;
                  
                  // Add to parent or root
                  if (parentNode) {
                    parentNode.children.push(node);
                  } else {
                    rootNodes[currentPath] = node;
                  }
                  
                  parentNode = node;
                } else {
                  parentNode = nodeMap[currentPath];
                }
              }
            });
            
            // Convert rootNodes object to array
            return Object.values(rootNodes);
          };
          
          // Build nested tree structure from new components
          const newCrdTreeNodes = buildNestedTree(processedComponents);

          // Helper function to extract all file nodes from existing tree
          const extractFileNodes = (nodes) => {
            const fileNodes = [];
            const traverse = (nodeList) => {
              nodeList.forEach(node => {
                if (node.type === 'file') {
                  fileNodes.push({
                    id: node.id,
                    name: node.name,
                    pathName: node.pathName || node.githubPath,
                    githubPath: node.githubPath || node.pathName,
                    githubBranch: node.githubBranch || 'main',
                    lineCount: node.lineCount || 0
                  });
                }
                if (node.children && node.children.length > 0) {
                  traverse(node.children);
                }
              });
            };
            traverse(nodes);
            return fileNodes;
          };
          
          // Helper function to merge trees: combine existing file nodes with new components, then rebuild tree
          const mergeTrees = (existingNodes, newComponents) => {
            // Extract existing file nodes
            const existingFileNodes = extractFileNodes(existingNodes);
            
            // Combine with new components (avoid duplicates by path)
            const allComponents = [...existingFileNodes];
            const existingPaths = new Set(existingFileNodes.map(n => n.pathName || n.githubPath));
            
            newComponents.forEach(comp => {
              const getFilePath = (path) => {
                if (!path) return comp.name || 'component';
                return path.startsWith('/') ? path.substring(1) : path;
              };
              const fullPath = getFilePath(comp.pathName || comp.githubPath || comp.name);
              
              if (!existingPaths.has(fullPath)) {
                allComponents.push({
                  id: comp.id || nanoid(),
                  name: comp.name,
                  pathName: fullPath,
                  githubPath: fullPath,
                  githubBranch: comp.githubBranch || 'main',
                  lineCount: comp.lineCount || 0
                });
                existingPaths.add(fullPath);
              }
            });
            
            // Rebuild tree from all components
            return buildNestedTree(allComponents);
          };
          
          // Check if CRD tree already exists - document ID format: {projectId}_{repoId} - trim edilmiş
          const documentId = `${String(projectId).trim()}_${String(repoId).trim()}`;
          const existingCrd = await db.collection('crd_relations').doc(documentId).get();
          
          if (existingCrd.exists) {
            // Update existing CRD tree - merge new components with folder structure
            const existingData = existingCrd.data();
            const existingNodes = existingData.data || [];
            
            // Merge trees preserving folder structure
            const mergedNodes = mergeTrees(existingNodes, processedComponents);
            
            // Count total nodes (including nested)
            const countNodes = (nodes) => {
              let count = nodes.length;
              nodes.forEach(node => {
                if (node.children && node.children.length > 0) {
                  count += countNodes(node.children);
                }
              });
              return count;
            };
            const totalNodeCount = countNodes(mergedNodes);
            
            await db.collection('crd_relations').doc(documentId).update({
              data: mergedNodes,
              nodeCount: totalNodeCount,
              updatedAt: GetCurrentDateTime()
            });
            
            console.log(`✅ CRD tree updated in Firestore for repo: ${documentId} with folder structure`);
          } else {
            // Create new CRD tree with folder structure
            // Count total nodes (including nested)
            const countNodes = (nodes) => {
              let count = nodes.length;
              nodes.forEach(node => {
                if (node.children && node.children.length > 0) {
                  count += countNodes(node.children);
                }
              });
              return count;
            };
            const totalNodeCount = countNodes(newCrdTreeNodes);
            
            await db.collection('crd_relations').doc(documentId).set({
              id: documentId,
              repoId: repoId,
              projectId: projectId,
              data: newCrdTreeNodes,
              nodeCount: totalNodeCount,
              createdAt: GetCurrentDateTime(),
              updatedAt: GetCurrentDateTime()
            });
            
            console.log(`✅ CRD tree created in Firestore for repo: ${documentId} with folder structure`);
            console.log(`   Total nodes: ${totalNodeCount}`);
            console.log(`   Root nodes: ${newCrdTreeNodes.length}`);
          }
        } catch (crdError) {
          console.error("❌ Error saving CRD tree to Firestore:", crdError);
          console.error("   Error details:", crdError.message, crdError.stack);
          // Don't fail the request if CRD tree save fails
        }
      } else {
        console.log(`⚠️ Skipping CRD tree creation: processedComponents.length=${processedComponents.length}, repoId=${repoId}`);
      }
    } catch (firestoreError) {
      console.error("Error saving virtual repo to Firestore:", firestoreError);
    }
    
    console.log(`✅ Virtual repo operation completed successfully`);
    console.log(`   Repo ID (GitHub): ${repo.id}`);
    console.log(`   Repo ID (Firestore): ${repoId || 'null'}`);
    console.log(`   Components processed: ${processedComponents.length}`);
    
    // Get the actual CRD.md URL
    let crdUrl = null;
    try {
      crdUrl = `https://github.com/${repo.full_name}/blob/main/CRD.md`;
    } catch (urlError) {
      // Ignore URL errors
    }
    
    return res.status(200).json({
      success: true,
      repo: {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        html_url: repo.html_url,
        private: repo.private,
        crd_url: crdUrl // Include CRD.md URL in response
      },
      repoId: repoId || null, // Include Firestore repoId in response
      components: processedComponents,
      totalComponents: processedComponents.length,
      totalLines: processedComponents.reduce((sum, comp) => sum + (comp.lineCount || 0), 0),
      status: 200,
    });
  } catch (error) {
    console.error("createVirtualRepo Error:", error);

    const status = error.status || 500;
    const message =
      error.response?.data?.message ||
      error.message ||
      "Failed to create virtual repository";

    return res.status(status).json({
      success: false,
      error: message,
      details: error.response?.data,
      status,
    });
  }
};

export default createVirtualRepo;