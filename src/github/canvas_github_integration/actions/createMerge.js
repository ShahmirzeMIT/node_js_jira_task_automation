import axios from "axios";
import { db } from "../../../../config/firebase.js";

const getUserToken = async (userId) => {
    if (!userId || typeof userId !== 'string') {
        throw new Error("Invalid userId provided");
    }
    const doc = await db.collection('user_tokens').doc(userId).get();
    if (!doc.exists) throw new Error("Token not found");
    return doc.data().accessToken;
};

const createMerge = async (req, res) => {
    try {
        const { userId, data, currentRepoId } = req.body;

        if (!userId || !data) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: userId and data"
            });
        }

        // Extract required fields from data structure
        const prNumber = data.prNumber;
        const repoFullName = data.repoFullName;
        const compareRepoFullName = data.compareRepoFullName;
        const baseBranch = data.base?.ref || 'main';
        const headBranch = data.head?.ref || 'main';
        const projectId = data.projectId;
        const githubRepoId = data.githubRepoId;
        const selectedNodes = data.selectedNodes || [];
        const prId = data.id;
        const title = data.title || 'Merge pull request';
        const body = data.body || '';
        const treeData=data.treeData

        // Validate required data fields
        const requiredFields = [
            { field: 'prNumber', value: prNumber },
            { field: 'repoFullName', value: repoFullName },
            { field: 'compareRepoFullName', value: compareRepoFullName },
            { field: 'baseBranch', value: baseBranch },
            { field: 'headBranch', value: headBranch },
            { field: 'projectId', value: projectId },
            { field: 'githubRepoId', value: githubRepoId },
            { field: 'selectedNodes', value: selectedNodes }
        ];

        const missingFields = requiredFields.filter(f => !f.value);
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing required field(s): ${missingFields.map(f => f.field).join(', ')}`,
                missingFields: missingFields.map(f => f.field)
            });
        }

        // Validate selectedNodes
        if (!Array.isArray(selectedNodes) || selectedNodes.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No files selected for merge"
            });
        }

        // Get GitHub token
        let githubToken;
        try {
            githubToken = await getUserToken(userId);
        } catch (error) {
            console.error("Error getting GitHub token:", error);
            return res.status(401).json({
                success: false,
                error: "Failed to get GitHub access token"
            });
        }

        // Extract repository information
        let [baseOwner, baseRepo] = repoFullName.split('/');
        const [compareOwner, compareRepo] = compareRepoFullName.split('/');

        if (!baseOwner || !baseRepo || !compareOwner || !compareRepo) {
            return res.status(400).json({
                success: false,
                error: "Invalid repository format"
            });
        }

  
        let tokenUser = null;
        try {
            const userResponse = await axios.get(
                'https://api.github.com/user',
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            tokenUser = userResponse.data.login;
        } catch (error) {
            console.error('❌ Error checking token:', error.response?.data || error.message);
            return res.status(401).json({
                success: false,
                error: "GitHub token is invalid or expired",
                suggestions: ["Refresh your GitHub token", "Check token permissions"]
            });
        }

        // Check if base repository exists
        let baseRepoExists = false;
        let baseRepoInfo = null;
        try {
            const repoResponse = await axios.get(
                `https://api.github.com/repos/${baseOwner}/${baseRepo}`,
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            baseRepoExists = true;
            baseRepoInfo = repoResponse.data;
           
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`❌ Base repository NOT FOUND: ${baseOwner}/${baseRepo}`);
                console.log('Will attempt to fork compare repository...');
            } else {
                console.error(`❌ Error checking base repository:`, error.response?.data || error.message);
                return res.status(403).json({
                    success: false,
                    error: `Cannot access repository ${baseOwner}/${baseRepo}: ${error.response?.data?.message || error.message}`,
                    suggestions: [
                        "Check if you have access to this repository",
                        "Verify repository exists and is accessible",
                        "Check token permissions for organization repositories"
                    ]
                });
            }
        }

        // If base repository doesn't exist, fork it
        if (!baseRepoExists) {
            try {
              
                const forkResponse = await axios.post(
                    `https://api.github.com/repos/${compareOwner}/${compareRepo}/forks`,
                    {
                        name: baseRepo,
                        description: `Forked from ${compareRepoFullName} for deployment`
                    },
                    {
                        headers: {
                            'Authorization': `token ${githubToken}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    }
                );
                
                const forkedRepoName = forkResponse.data.name;
                const forkedRepoFullName = forkResponse.data.full_name;
                
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Try to transfer to organization (if organization)
                if (baseOwner !== tokenUser) {
                    try {
                        // Transfer repository to organization
                        await axios.post(
                            `https://api.github.com/repos/${tokenUser}/${forkedRepoName}/transfer`,
                            {
                                new_owner: baseOwner
                            },
                            {
                                headers: {
                                    'Authorization': `token ${githubToken}`,
                                    'Accept': 'application/vnd.github.v3+json'
                                }
                            }
                        );
                        
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        
                        // Update repository info
                        baseRepoExists = true;
                  
                        
                    } catch (transferError) {
                        console.warn(`⚠️ Could not transfer to organization: ${transferError.response?.data?.message || transferError.message}`);

                        
                        // Use forked repository if transfer failed
                        const [newBaseOwner, newBaseRepo] = forkedRepoFullName.split('/');
                        baseOwner = newBaseOwner;
                        baseRepo = newBaseRepo;
                        baseRepoExists = true;
                    }
                }
                
            } catch (forkError) {
                console.error(`❌ Failed to fork repository:`, forkError.response?.data || forkError.message);
                
                return res.status(404).json({
                    success: false,
                    error: `Target repository ${baseOwner}/${baseRepo} does not exist and could not be forked`,
                    suggestions: [
                        `Create the repository ${baseRepo} in the ${baseOwner} organization first`,
                        "Check if you have permission to create repositories in the organization",
                        "Use an existing repository as target"
                    ]
                });
            }
        }

        // Check if base branch exists
        let baseBranchExists = false;
        let actualBaseBranch = baseBranch;
        try {
            console.log(`🔍 Checking if base branch exists: ${baseBranch}`);
            await axios.get(
                `https://api.github.com/repos/${baseOwner}/${baseRepo}/branches/${baseBranch}`,
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            baseBranchExists = true;
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`❌ Base branch NOT FOUND: ${baseBranch}`);
                console.log('Will use default branch...');
                
                try {
                    const repoInfo = await axios.get(
                        `https://api.github.com/repos/${baseOwner}/${baseRepo}`,
                        {
                            headers: {
                                'Authorization': `token ${githubToken}`,
                                'Accept': 'application/vnd.github.v3+json'
                            }
                        }
                    );
                    
                    actualBaseBranch = repoInfo.data.default_branch;
                    console.log(`🔄 Using default branch instead: ${actualBaseBranch}`);
                    
                } catch (repoError) {
                    console.error(`❌ Error getting default branch:`, repoError.response?.data || repoError.message);
                    actualBaseBranch = 'main';
                    console.log(`🔄 Using 'main' as fallback branch`);
                }
            }
        }

        // If branch doesn't exist, create it (if repository is empty)
        if (!baseBranchExists && actualBaseBranch !== baseBranch) {
            try {
                console.log(`🔄 Creating branch: ${baseBranch} from ${actualBaseBranch}`);
                
                // Get base branch SHA
                const baseBranchRef = await axios.get(
                    `https://api.github.com/repos/${baseOwner}/${baseRepo}/git/refs/heads/${actualBaseBranch}`,
                    {
                        headers: {
                            'Authorization': `token ${githubToken}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    }
                );
                
                const baseSha = baseBranchRef.data.object.sha;
                
                // Create new branch
                await axios.post(
                    `https://api.github.com/repos/${baseOwner}/${baseRepo}/git/refs`,
                    {
                        ref: `refs/heads/${baseBranch}`,
                        sha: baseSha
                    },
                    {
                        headers: {
                            'Authorization': `token ${githubToken}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    }
                );
                
                actualBaseBranch = baseBranch;
                console.log(`✅ Created branch: ${baseBranch}`);
                
            } catch (createBranchError) {
                console.warn(`⚠️ Could not create branch ${baseBranch}:`, createBranchError.response?.data?.message || createBranchError.message);
                console.log(`ℹ️ Will use ${actualBaseBranch} branch instead`);
            }
        }

        // Process files - REMOVE DUPLICATES
        const processedFiles = [];
        const failedFiles = [];
        const processedPaths = new Set();

        for (const node of selectedNodes) {
            try {
                // Check if file content exists
                if (!node.fileContent) {
                    console.warn(`⚠️ No file content for: ${node.githubPath}`);
                    failedFiles.push({
                        path: node.githubPath,
                        error: "File content not available"
                    });
                    continue;
                }

                // Validate required node fields
                if (!node.githubPath || !node.name) {
                    console.warn(`⚠️ Missing required fields in node:`, node);
                    failedFiles.push({
                        path: node.githubPath || 'unknown',
                        error: "Missing required file information"
                    });
                    continue;
                }

                // Check for duplicates - FIX: PREVENT DUPLICATE FILES
                if (processedPaths.has(node.githubPath)) {
                    console.warn(`⚠️ Duplicate file skipped: ${node.githubPath}`);
                    continue;
                }

                processedPaths.add(node.githubPath);
                processedFiles.push({
                    path: node.githubPath,
                    content: node.fileContent,
                    node: node,
                    originalRepo: node.githubRepoFullName || compareRepoFullName
                });

                console.log(`✅ File content available for: ${node.githubPath} (${node.fileContent.length} bytes) from ${node.githubRepoFullName || compareRepoFullName}`);

            } catch (error) {
                console.error(`❌ Error processing file ${node.githubPath || 'unknown'}:`, error);
                failedFiles.push({
                    path: node.githubPath || 'unknown',
                    error: error.message
                });
            }
        }

        if (processedFiles.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No valid file content available for merge",
                failedFiles: failedFiles
            });
        }

        console.log(`📊 Files processed: ${processedFiles.length}/${selectedNodes.length} (Duplicates removed: ${selectedNodes.length - processedFiles.length})`);
        if (failedFiles.length > 0) {
            console.log(`⚠️ Failed to process ${failedFiles.length} files:`, failedFiles);
        }

        // Create a single commit with ALL files - FIXED SINGLE COMMIT CREATION
        const updateResults = [];
        const updateErrors = [];
        let singleCommitSuccess = false;

        try {
            console.log(`🚀 Creating single commit with ${processedFiles.length} files...`);
            
            // First, get the latest commit SHA of the base branch
            const branchRef = await axios.get(
                `https://api.github.com/repos/${baseOwner}/${baseRepo}/git/refs/heads/${actualBaseBranch}`,
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            const latestCommitSha = branchRef.data.object.sha;
            console.log(`📌 Latest commit SHA: ${latestCommitSha.substring(0, 8)}...`);
            
            // Get the tree associated with the latest commit
            const commitResponse = await axios.get(
                `https://api.github.com/repos/${baseOwner}/${baseRepo}/git/commits/${latestCommitSha}`,
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            const baseTreeSha = commitResponse.data.tree.sha;
            console.log(`📌 Base tree SHA: ${baseTreeSha.substring(0, 8)}...`);
            
            // Create tree entries for all files - FIXED: Use proper tree structure
            const treeEntries = [];
            
            for (const file of processedFiles) {
                // Convert content to base64
                const base64Content = Buffer.from(file.content).toString('base64');
                
                // Create blob for the file content
                const blobResponse = await axios.post(
                    `https://api.github.com/repos/${baseOwner}/${baseRepo}/git/blobs`,
                    {
                        content: base64Content,
                        encoding: 'base64'
                    },
                    {
                        headers: {
                            'Authorization': `token ${githubToken}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    }
                );
                
                const blobSha = blobResponse.data.sha;
                
                // Create tree entry
                treeEntries.push({
                    path: file.path,
                    mode: '100644', // Regular file
                    type: 'blob',
                    sha: blobSha // Use blob SHA instead of content
                });
                
                console.log(`📝 Added to tree: ${file.path} (SHA: ${blobSha.substring(0, 8)}...)`);
            }
            
            // Create a new tree with all files
            console.log(`🌳 Creating new tree with ${treeEntries.length} files...`);
            const treeResponse = await axios.post(
                `https://api.github.com/repos/${baseOwner}/${baseRepo}/git/trees`,
                {
                    base_tree: baseTreeSha, // Start from existing tree
                    tree: treeEntries
                },
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            const newTreeSha = treeResponse.data.sha;
            console.log(`✅ New tree created: ${newTreeSha.substring(0, 8)}...`);
            
            // Create a new commit
            const commitMessage = `Merge from ${compareRepoFullName}\n\nPR #${prNumber}: ${title}\n\n${body || 'Deploying files to main repository.'}\n\nFiles deployed: ${processedFiles.length}`;
            
            console.log(`📝 Creating commit with message: ${commitMessage.substring(0, 100)}...`);
            const commitResponse2 = await axios.post(
                `https://api.github.com/repos/${baseOwner}/${baseRepo}/git/commits`,
                {
                    message: commitMessage,
                    tree: newTreeSha,
                    parents: [latestCommitSha]
                },
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            const newCommitSha = commitResponse2.data.sha;
            console.log(`✅ New commit created: ${newCommitSha.substring(0, 8)}...`);
            
            // Update the branch reference
            await axios.patch(
                `https://api.github.com/repos/${baseOwner}/${baseRepo}/git/refs/heads/${actualBaseBranch}`,
                {
                    sha: newCommitSha,
                    force: false
                },
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            console.log(`✅ Branch ${actualBaseBranch} updated to new commit`);
            
            // Get file URLs for the update results
            for (const file of processedFiles) {
                updateResults.push({
                    path: file.path,
                    success: true,
                    action: 'created/updated',
                    sha: newCommitSha,
                    url: `https://github.com/${baseOwner}/${baseRepo}/blob/${actualBaseBranch}/${file.path}`,
                    originalRepo: file.originalRepo,
                    targetRepo: `${baseOwner}/${baseRepo}`,
                    branch: actualBaseBranch
                });
            }
            
            singleCommitSuccess = true;
            console.log(`🎉 Successfully deployed ${processedFiles.length} files in a SINGLE commit!`);
            
        } catch (error) {
            console.error(`❌ Error creating single commit:`, error.response?.data || error.message);
            console.error(`Error details:`, error);
            
            // If single commit fails, use batch update approach with minimal commits
            console.log(`🔄 Using batch update approach...`);
            
            // Group files by directory to minimize commits
            const filesByDir = {};
            processedFiles.forEach(file => {
                const dir = file.path.substring(0, file.path.lastIndexOf('/')) || '/';
                if (!filesByDir[dir]) filesByDir[dir] = [];
                filesByDir[dir].push(file);
            });
            
            // Process files in batches (by directory)
            for (const [dir, files] of Object.entries(filesByDir)) {
                if (files.length === 0) continue;
                
                try {
                    console.log(`📁 Processing ${files.length} files in directory: ${dir}`);
                    
                    // Create a commit for this batch
                    const commitMessage = `Deploy from ${compareRepoFullName}\n\nPR #${prNumber}: ${title}\n\nFiles: ${files.map(f => f.path).join(', ')}`;
                    
                    // Use GitHub API to create or update multiple files in one commit
                    for (const file of files) {
                        try {
                            // Check if file exists
                            let existingFileSha = null;
                            try {
                                const existingFileResponse = await axios.get(
                                    `https://api.github.com/repos/${baseOwner}/${baseRepo}/contents/${file.path}`,
                                    {
                                        headers: {
                                            'Authorization': `token ${githubToken}`,
                                            'Accept': 'application/vnd.github.v3+json'
                                        },
                                        params: {
                                            ref: actualBaseBranch
                                        }
                                    }
                                );
                                
                                if (existingFileResponse.data && existingFileResponse.data.sha) {
                                    existingFileSha = existingFileResponse.data.sha;
                                }
                            } catch (checkError) {
                                // File doesn't exist, that's okay
                            }
                            
                            // Convert content to base64
                            const base64Content = Buffer.from(file.content).toString('base64');
                            
                            // Create or update file
                            const requestBody = {
                                message: commitMessage,
                                content: base64Content,
                                branch: actualBaseBranch
                            };
                            
                            // Add SHA if file exists
                            if (existingFileSha) {
                                requestBody.sha = existingFileSha;
                            }
                            
                            const updateResponse = await axios.put(
                                `https://api.github.com/repos/${baseOwner}/${baseRepo}/contents/${file.path}`,
                                requestBody,
                                {
                                    headers: {
                                        'Authorization': `token ${githubToken}`,
                                        'Accept': 'application/vnd.github.v3+json',
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );

                            const action = existingFileSha ? 'updated' : 'created';
                            updateResults.push({
                                path: file.path,
                                success: true,
                                action: action,
                                sha: updateResponse.data.content.sha,
                                url: updateResponse.data.content.html_url,
                                originalRepo: file.originalRepo,
                                targetRepo: `${baseOwner}/${baseRepo}`,
                                branch: actualBaseBranch
                            });

                            console.log(`✅ Successfully ${action} file: ${file.path}`);

                        } catch (error) {
                            console.error(`❌ Error deploying file ${file.path}:`, error.response?.data || error.message);
                            
                            const errorDetails = {
                                path: file.path,
                                error: error.response?.data?.message || error.message,
                                status: error.response?.status,
                                details: error.response?.data,
                                originalRepo: file.originalRepo,
                                targetRepo: `${baseOwner}/${baseRepo}`,
                                branch: actualBaseBranch
                            };
                            
                            updateErrors.push(errorDetails);
                        }
                    }
                    
                    // Small delay between batches
                    if (Object.keys(filesByDir).length > 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                } catch (batchError) {
                    console.error(`❌ Error processing batch for directory ${dir}:`, batchError.message);
                }
            }
        }

        if (updateErrors.length > 0) {
            console.log(`⚠️ ${updateErrors.length} files failed to update:`, updateErrors);
        }

        // 1. UPDATE crd_relations COLLECTION WITH treeData - FIXED
        let relationsUpdateSuccess = false;
        if ( currentRepoId && projectId) {
            try {
                const relationsDocId = `${projectId}_${currentRepoId}`;
                const relationsRef = db.collection('crd_relations').doc(relationsDocId);
                
        
                const relationsData = {
                    data: treeData,
                    updatedAt: new Date().toISOString(),
                    updatedBy: userId,
                    prNumber: prNumber,
                    prTitle: title,
                    // Ensure these fields are always set
                    id: relationsDocId,
                    projectId: projectId,
                    repoId: currentRepoId
                };
                
                // Always use set with merge to ensure document is created if it doesn't exist
                await relationsRef.set(relationsData, { merge: true });
                
                // Verify the update
                const verifyDoc = await relationsRef.get();
                if (verifyDoc.exists) {
                    relationsUpdateSuccess = true;
                    console.log(`✅ Successfully updated crd_relations document: ${relationsDocId}`);
                    console.log(`📊 Document data keys:`, Object.keys(verifyDoc.data() || {}));
                } else {
                    console.error(`❌ Document not found after update: ${relationsDocId}`);
                    relationsUpdateSuccess = false;
                }
                
            } catch (relationsError) {
                console.error('❌ Error updating crd_relations:', relationsError);
                console.error('Error details:', relationsError.message);
                console.error('Error stack:', relationsError.stack);
                relationsUpdateSuccess = false;
            }
        } else {
            console.log(`⚠️ Skipping crd_relations update: Missing required data`);
            console.log(`- treeData: ${!!treeData}`);
            console.log(`- currentRepoId: ${currentRepoId}`);
            console.log(`- projectId: ${projectId}`);
        }

        // 2. UPDATE crd_pull_requests COLLECTION - MARK PR AS CLOSED - FIXED
        let documentUpdateSuccess = false;
        let documentId = `${projectId}_${githubRepoId}`;
        try {
            console.log(`📝 Updating PR document: ${documentId}`);
            
            const docRef = db.collection('crd_pull_requests').doc(documentId);
            
            // Get the document
            const docSnap = await docRef.get();
            
            let docData = {};
            if (docSnap.exists) {
                docData = docSnap.data();
                console.log(`✅ Found existing document with ${docData.pull_requests?.length || 0} PRs`);
            } else {
                console.log(`📄 Creating new document: ${documentId}`);
                docData = {
                    projectId: projectId,
                    githubRepoId: githubRepoId,
                    createdAt: new Date().toISOString(),
                    pull_requests: []
                };
            }
            
            const pullRequests = docData.pull_requests || [];
            
            // Find and update the specific PR
            let prFound = false;
            const updatedPullRequests = pullRequests.map(pr => {
                if (pr.prNumber === prNumber || pr.number === prNumber || pr.id === prId) {
                    prFound = true;
                    console.log(`✅ Found and updating PR: ${pr.prNumber || pr.number || pr.id}`);
                    
                    return {
                        ...pr,
                        state: "closed",
                        mergedAt: new Date().toISOString(),
                        deployed: updateResults.length > 0,
                        updatedAt: new Date().toISOString(),
                        deployResults: {
                            filesDeployed: updateResults.length,
                            filesFailed: updateErrors.length,
                            totalFiles: processedFiles.length,
                            timestamp: new Date().toISOString(),
                            baseRepository: `${baseOwner}/${baseRepo}`,
                            compareRepository: compareRepoFullName,
                            baseBranch: actualBaseBranch,
                            successfulFiles: updateResults.map(r => r.path),
                            failedFiles: updateErrors.map(e => e.path),
                            singleCommit: singleCommitSuccess
                        },
                        relationsUpdate: relationsUpdateSuccess,
                        // Preserve other fields
                        title: pr.title || title,
                        body: pr.body || body,
                        prNumber: pr.prNumber || prNumber,
                        createdBy: pr.createdBy || data.createdBy || userId,
                        selectedNodes: pr.selectedNodes || selectedNodes,
                        createdAt: pr.createdAt || data.createdAt || new Date().toISOString(),
                        head: pr.head || data.head,
                        base: pr.base || data.base,
                        repoFullName: `${baseOwner}/${baseRepo}`,
                        compareRepoFullName: compareRepoFullName,
                        projectId: projectId,
                        githubRepoId: githubRepoId
                    };
                }
                return pr;
            });
            
            // If PR not found, add it
            if (!prFound) {
                console.log(`➕ PR not found in document, adding new PR entry`);
                updatedPullRequests.push({
                    id: prId,
                    title: title,
                    body: body,
                    prNumber: prNumber,
                    state: "closed",
                    createdBy: data.createdBy || userId,
                    selectedNodes: selectedNodes,
                    createdAt: data.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    head: data.head,
                    base: data.base,
                    repoFullName: `${baseOwner}/${baseRepo}`,
                    compareRepoFullName: compareRepoFullName,
                    projectId: projectId,
                    githubRepoId: githubRepoId,
                    mergedAt: new Date().toISOString(),
                    deployed: updateResults.length > 0,
                    deployResults: {
                        filesDeployed: updateResults.length,
                        filesFailed: updateErrors.length,
                        totalFiles: processedFiles.length,
                        timestamp: new Date().toISOString(),
                        baseRepository: `${baseOwner}/${baseRepo}`,
                        compareRepository: compareRepoFullName,
                        baseBranch: actualBaseBranch,
                        successfulFiles: updateResults.map(r => r.path),
                        failedFiles: updateErrors.map(e => e.path),
                        singleCommit: singleCommitSuccess
                    },
                    relationsUpdate: relationsUpdateSuccess
                });
            }
            
            // Prepare document data
            const updatedDoc = {
                pull_requests: updatedPullRequests,
                updatedAt: new Date().toISOString(),
                projectId: projectId,
                githubRepoId: githubRepoId,
                updatedDates: [...(docData.updatedDates || []), new Date().toISOString()],
                updatedBys: [...(docData.updatedBys || []), userId]
            };
            
            // Add createdAt if it's a new document
            if (!docSnap.exists) {
                updatedDoc.createdAt = new Date().toISOString();
            }
            
            // Update the document
            await docRef.set(updatedDoc, { merge: true });
            
            // Verify update
            const verifyDoc = await docRef.get();
            if (verifyDoc.exists) {
                documentUpdateSuccess = true;
                console.log(`✅ Updated PR ${prNumber} to CLOSED state in document: ${documentId}`);
            } else {
                console.error(`❌ Document not found after update: ${documentId}`);
                documentUpdateSuccess = false;
            }

        } catch (error) {
            console.error("❌ Error updating crd_pull_requests document:", error);
            console.error("Error details:", error.message);
            console.error("Error stack:", error.stack);
            documentUpdateSuccess = false;
        }

        // Create response based on results
        const anySuccess = updateResults.length > 0;
        
        const response = {
            success: anySuccess,
            message: anySuccess 
                ? `✅ Successfully deployed ${updateResults.length} files from ${compareRepoFullName} to ${baseOwner}/${baseRepo}`
                : `❌ Failed to deploy files from ${compareRepoFullName} to ${baseOwner}/${baseRepo}`,
            deployment: {
                source: {
                    repo: compareRepoFullName,
                    url: `https://github.com/${compareRepoFullName}`
                },
                target: {
                    repo: `${baseOwner}/${baseRepo}`,
                    url: `https://github.com/${baseOwner}/${baseRepo}`,
                    branch: actualBaseBranch
                },
                summary: {
                    filesProcessed: processedFiles.length,
                    filesDeployed: updateResults.length,
                    filesFailed: updateErrors.length,
                    duplicatesRemoved: selectedNodes.length - processedFiles.length,
                    deploymentStatus: anySuccess ? "successful" : "failed",
                    singleCommit: singleCommitSuccess,
                    commitStrategy: singleCommitSuccess ? "single_commit" : "batch_commits"
                },
                databaseUpdates: {
                    pullRequests: documentUpdateSuccess ? "updated" : "failed",
                    relations: relationsUpdateSuccess ? "updated" : (treeData ? "failed" : "skipped")
                }
            },
            prUpdate: {
                prNumber: prNumber,
                prId: prId,
                oldState: "open",
                newState: "closed",
                updatedAt: new Date().toISOString(),
                documentUpdateSuccess: documentUpdateSuccess
            },
            details: {
                baseRepository: `${baseOwner}/${baseRepo}`,
                compareRepository: compareRepoFullName,
                baseBranch: actualBaseBranch,
                headBranch: headBranch,
                prNumber: prNumber,
                filesProcessed: processedFiles.length,
                filesUpdated: updateResults.length,
                filesFailed: updateErrors.length,
                duplicatesRemoved: selectedNodes.length - processedFiles.length,
                successfulUpdates: updateResults.map(f => ({
                    path: f.path,
                    success: f.success,
                    action: f.action,
                    sha: f.sha,
                    url: f.url
                })),
                failedUpdates: updateErrors.map(f => ({
                    path: f.path,
                    error: f.error,
                    status: f.status
                })),
                failedFetches: failedFiles.map(f => ({
                    path: f.path,
                    error: f.error
                }))
            },
            urls: {
                sourceRepository: `https://github.com/${compareRepoFullName}`,
                targetRepository: `https://github.com/${baseOwner}/${baseRepo}`,
                targetBranch: `https://github.com/${baseOwner}/${baseRepo}/tree/${actualBaseBranch}`,
                commitLink: singleCommitSuccess ? `https://github.com/${baseOwner}/${baseRepo}/commit/${updateResults[0]?.sha}` : null
            }
        };

        console.log(`📊 Final deployment summary:`);
        console.log(`- Files selected: ${selectedNodes.length}`);
        console.log(`- Files processed (duplicates removed): ${processedFiles.length}`);
        console.log(`- Files deployed: ${updateResults.length}`);
        console.log(`- Files failed: ${updateErrors.length}`);
        console.log(`- Single commit: ${singleCommitSuccess ? 'YES' : 'NO'}`);
        console.log(`- PR state changed to: closed`);
        console.log(`- crd_relations update: ${relationsUpdateSuccess ? 'success' : 'failed'}`);
        console.log(`- crd_pull_requests update: ${documentUpdateSuccess ? 'success' : 'failed'}`);

        return res.status(anySuccess ? 200 : 207).json(response);

    } catch (error) {
        console.error("❌ createMerge Error:", error);
        console.error("Error stack:", error.stack);
        
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || error.message || "Failed to deploy";

        const errorResponse = {
            success: false,
            error: message,
            details: error.response?.data,
            status: status,
            suggestions: [
                "Check if the GitHub token has write permissions to BOTH repositories",
                "Verify that both repositories exist and are accessible",
                "For organization repositories, ensure token has organization permissions",
                "Check if you can fork repositories (fork permission required)",
                "Verify repository URLs are correct"
            ]
        };

        console.error('Error Response:', JSON.stringify(errorResponse, null, 2));

        return res.status(status).json(errorResponse);
    }
};

export default createMerge;