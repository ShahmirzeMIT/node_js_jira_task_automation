import { db } from "../../../../config/firebase.js";
import { Octokit } from "octokit";

// Helper function to get GitHub token (reuse from getRepositoryImportTree)
const getGitHubToken = async (userId, uid = null) => {
  if (!userId && !uid) {
    throw new Error("userId or uid is required");
  }
  
  let doc = null;
  
  if (userId) {
    const githubIdStr = String(userId).trim();
    doc = await db.collection("user_tokens").doc(githubIdStr).get();
    
    if (!doc.exists && !isNaN(githubIdStr)) {
      const numId = parseInt(githubIdStr, 10);
      doc = await db.collection("user_tokens").doc(String(numId)).get();
    }
    
    if (doc && doc.exists) {
      const tokenData = doc.data();
      if (tokenData && tokenData.accessToken) {
        return tokenData.accessToken;
      }
    }
  }
  
  if (uid) {
    const userGithubsDoc = await db.collection("user_githubs").doc(uid).get();
    
    if (userGithubsDoc.exists) {
      const userData = userGithubsDoc.data();
      if (userData.github_ids && Array.isArray(userData.github_ids) && userData.github_ids.length > 0) {
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
  
  throw new Error(`GitHub token not found for userId: ${userId || 'N/A'}`);
};

// Convert import tree to TreeNode format
const convertImportTreeToNodes = (tree, repoId, repoFullName, branch, parentId = null) => {
  // Generate unique ID for each node
  const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const fileName = tree.path.split("/").pop() || tree.path;
  
  const node = {
    id: nodeId,
    name: fileName,
    type: "folder",
    isOpen: true,
    pathName: tree.path,
    githubRepoId: repoId,
    githubRepoFullName: repoFullName,
    githubBranch: branch,
    githubPath: tree.path,
    children: tree.imports && tree.imports.length > 0 
      ? tree.imports.map(importTree => {
          // Add small delay to ensure unique timestamps
          return convertImportTreeToNodes(importTree, repoId, repoFullName, branch, nodeId);
        })
      : []
  };
  
  return node;
};

// Find parent node in tree and add children
const addNodesToTree = (treeData, parentId, newNodes) => {
  if (parentId === null) {
    // Add to root
    return [...treeData, ...newNodes];
  }
  
  const findAndAdd = (nodes) => {
    return nodes.map(node => {
      if (node.id === parentId) {
        return {
          ...node,
          children: [...(node.children || []), ...newNodes]
        };
      }
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: findAndAdd(node.children)
        };
      }
      return node;
    });
  };
  
  return findAndAdd(treeData);
};

// Process tree data for saving
const processTreeData = (nodes) =>
  nodes.map((node) => ({
    ...node,
    id: node.id || generateId(),
    type: node.type || "folder",
    isOpen: node.isOpen !== undefined ? node.isOpen : false,
    children: node.children ? processTreeData(node.children) : undefined,
  }));

const generateId = () =>
  `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const countNodes = (nodes) => {
  let count = 0;
  const countRecursive = (list) => {
    list.forEach((node) => {
      count++;
      if (node.children?.length) countRecursive(node.children);
    });
  };
  countRecursive(nodes);
  return count;
};

const getTreeStructure = (nodes) => {
  const structure = { totalFolders: 0, totalFiles: 0, maxDepth: 0 };
  const analyze = (list, depth = 0) => {
    structure.maxDepth = Math.max(structure.maxDepth, depth);
    list.forEach((node) => {
      node.type === "folder" ? structure.totalFolders++ : structure.totalFiles++;
      if (node.children?.length) analyze(node.children, depth + 1);
    });
  };
  analyze(nodes);
  return structure;
};

const createCrdFromGithub = async (req, res) => {
  try {
    const { 
      userId, 
      uid, 
      repoId, 
      repoFullName, 
      branch, 
      entryFiles, 
      language,
      parentId,
      projectId 
    } = req.body;

    if (!userId || !repoFullName || !branch || !entryFiles || !projectId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: userId, repoFullName, branch, entryFiles, projectId",
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

    console.log("Creating CRD from GitHub:", { 
      userId, 
      repoFullName, 
      branch, 
      entryFilesCount: entryFiles.length,
      parentId,
      projectId
    });

    // Get existing CRD data if it exists
    const documentId = `${projectId}_${repoId}`;
    const crdDocRef = db.collection("crd_relations").doc(documentId);
    const docSnapshot = await crdDocRef.get();
    let existingTreeData = [];
    
    if (docSnapshot.exists) {
      const existingData = docSnapshot.data();
      existingTreeData = existingData.data || [];
    }

    // Directly use the import tree logic - extract core functions
    let importTreeResult = null;
    
    try {
      console.log("Starting import tree analysis...");
      const token = await getGitHubToken(userId, uid);
      const octokit = new Octokit({ auth: token });

      const [owner, repo] = repoFullName.split("/");
      if (!owner || !repo) {
        return res.status(400).json({
          success: false,
          error: "Invalid repoFullName format. Expected: owner/repo",
          status: 400,
        });
      }

      // Get all repo files with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("GitHub API request timeout after 30 seconds")), 30000);
      });

      const refDataPromise = octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });

      const { data: refData } = await Promise.race([refDataPromise, timeoutPromise]);

      const treeDataPromise = octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: refData.object.sha,
        recursive: true,
      });

      const { data: treeData } = await Promise.race([treeDataPromise, timeoutPromise]);

      const allRepoFiles = treeData.tree
        .filter((item) => item.type === "blob")
        .map((file) => file.path);

      console.log(`Found ${allRepoFiles.length} files in repository`);

      // Import helper functions from getRepositoryImportTree
      const getRepositoryImportTreeModule = await import("./getRepositoryImportTree.js");
      
      // Create mock request/response to capture result
      const mockReq = {
        body: { userId, uid, repoFullName, branch, entryFiles, language }
      };
      
      let capturedResult = null;
      let capturedError = null;
      let capturedStatus = null;
      
      const mockRes = {
        status: (code) => {
          capturedStatus = code;
          return {
            json: (data) => {
              if (code === 200 && data.success) {
                capturedResult = data;
              } else {
                capturedError = data.error || data.message || "Unknown error";
              }
            }
          };
        }
      };
      
      // Call the function with timeout
      const importTreeTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Import tree analysis timeout after 60 seconds")), 60000);
      });

      await Promise.race([
        getRepositoryImportTreeModule.default(mockReq, mockRes),
        importTreeTimeout
      ]);
      
      if (capturedError) {
        console.error("Import tree analysis error:", capturedError);
        // If we have partial results, use them
        if (capturedResult && capturedResult.trees && capturedResult.trees.length > 0) {
          console.warn("Using partial results despite error:", capturedError);
          importTreeResult = capturedResult;
        } else {
          throw new Error(capturedError);
        }
      } else if (capturedStatus && capturedStatus !== 200) {
        throw new Error(`Import tree analysis failed with status ${capturedStatus}`);
      }
      
      if (!capturedResult || !capturedResult.trees) {
        console.error("No import trees returned");
        // Check if we have entry files - create minimal nodes for them
        if (entryFiles && entryFiles.length > 0) {
          console.warn("Creating minimal nodes for entry files without import analysis");
          importTreeResult = {
            trees: entryFiles.map(entry => ({
              entry: entry,
              tree: {
                path: entry,
                imports: []
              },
              imports: []
            }))
          };
        } else {
          return res.status(500).json({
            success: false,
            error: "Failed to analyze imports from GitHub - no trees returned and no entry files",
            status: 500,
          });
        }
      } else {
        importTreeResult = capturedResult;
      }
      
      console.log(`Import tree analysis completed. Found ${importTreeResult.trees.length} entry trees`);
      
      // Validate trees
      if (importTreeResult.trees.length === 0) {
        console.warn("Warning: No trees found in import analysis result");
      }
      
    } catch (importError) {
      console.error("Error getting import tree:", importError);
      console.error("Error stack:", importError.stack);
      
      // If we have entry files, create minimal structure
      if (entryFiles && entryFiles.length > 0) {
        console.warn("Creating minimal CRD structure due to import analysis error");
        importTreeResult = {
          trees: entryFiles.map(entry => ({
            entry: entry,
            tree: {
              path: entry,
              imports: []
            },
            imports: []
          }))
        };
      } else {
        return res.status(500).json({
          success: false,
          error: "Failed to analyze imports from GitHub: " + (importError.message || "Unknown error"),
          details: importError.stack,
          status: 500,
        });
      }
    }

    // Convert import trees to TreeNode format (optimized with parallel processing)
    console.log("Converting import trees to nodes...");
    
    if (!importTreeResult || !importTreeResult.trees || importTreeResult.trees.length === 0) {
      console.error("No trees to convert");
      return res.status(500).json({
        success: false,
        error: "No import trees available for conversion",
        status: 500,
      });
    }
    
    const newNodes = await Promise.all(
      importTreeResult.trees.map(async (treeData, index) => {
        try {
          if (!treeData) {
            console.warn(`Tree data at index ${index} is null or undefined`);
            return null;
          }
          
          const entryNode = treeData.tree || {
            path: treeData.entry || `entry_${index}`,
            imports: treeData.imports || []
          };
          
          if (!entryNode.path) {
            console.warn(`Entry node at index ${index} has no path`);
            return null;
          }
          
          const node = convertImportTreeToNodes(entryNode, repoId, repoFullName, branch);
          console.log(`Converted node: ${node.name} with ${node.children?.length || 0} children`);
          return node;
        } catch (error) {
          console.error(`Error converting tree at index ${index}:`, error);
          // Return a minimal node for this entry
          return {
            id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: treeData.entry?.split("/").pop() || `entry_${index}`,
            type: "folder",
            isOpen: true,
            pathName: treeData.entry || `entry_${index}`,
            githubRepoId: repoId,
            githubRepoFullName: repoFullName,
            githubBranch: branch,
            githubPath: treeData.entry || `entry_${index}`,
            children: []
          };
        }
      })
    );
    
    // Filter out null nodes
    const validNodes = newNodes.filter(node => node !== null);
    
    if (validNodes.length === 0) {
      console.error("No valid nodes after conversion");
      return res.status(500).json({
        success: false,
        error: "Failed to convert import trees to nodes - no valid nodes created",
        status: 500,
      });
    }
    
    console.log(`Converted ${validNodes.length} valid entry nodes (${newNodes.length - validNodes.length} failed)`);

    // Add new nodes to existing tree
    let updatedTreeData;
    if (parentId === null) {
      // Add to root
      updatedTreeData = [...existingTreeData, ...validNodes];
    } else {
      // Find parent and add children
      updatedTreeData = addNodesToTree(existingTreeData, parentId, validNodes);
    }

    // Process and save tree data (optimized - do counting in parallel)
    console.log("Processing and saving tree data...");
    const processedData = processTreeData(updatedTreeData);

    // Calculate stats in parallel
    const [nodeCount, treeStructure] = await Promise.all([
      Promise.resolve(countNodes(processedData)),
      Promise.resolve(getTreeStructure(processedData))
    ]);

    const documentData = {
      data: processedData,
      updatedAt: new Date(),
      nodeCount: nodeCount,
      treeStructure: treeStructure,
    };

    // Save to database
    if (docSnapshot.exists) {
      await crdDocRef.update(documentData);
      console.log("CRD updated in database");
    } else {
      const newDocument = {
        id: documentId,
        repoId,
        projectId,
        createdAt: new Date(),
        ...documentData,
      };
      await crdDocRef.set(newDocument);
      console.log("CRD created in database");
    }

    console.log(`CRD creation completed. Total nodes: ${nodeCount}`);

    return res.status(200).json({
      success: true,
      message: "CRD structure created successfully from GitHub",
      data: processedData,
      status: 200,
    });
  } catch (error) {
    console.error("Error creating CRD from GitHub:", error);
    console.error("Error stack:", error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create CRD from GitHub",
      status: 500,
    });
  }
};

export default createCrdFromGithub;


