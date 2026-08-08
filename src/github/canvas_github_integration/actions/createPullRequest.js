import axios from 'axios';

// Main handler - Only saves to Firestore collections, NO GitHub API calls
const createPullRequest = async (req, res) => {
  const { userId, uid, repoFullName, compareRepoFullName, projectId, title, body, base, selectedNodes, githubRepoId, treeData } = req.body;

  if (!repoFullName) {
    return res.status(400).json({
      success: false,
      error: "Missing required field: repoFullName (base repository)",
      status: 400,
    });
  }

  if (!compareRepoFullName) {
    return res.status(400).json({
      success: false,
      error: "Missing required field: compareRepoFullName (virtual repository)",
      status: 400,
    });
  }

  if (!title) {
    return res.status(400).json({
      success: false,
      error: "Missing required field: title",
      status: 400,
    });
  }

  try {
    const { db, admin } = await import("../../../config/firebase.js");
    const { FieldValue } = await import("firebase-admin/firestore");
    
    const prNumber = Date.now();
    const now = admin.firestore.Timestamp.now();
    const prTitle = title || `Merge virtual repository: ${compareRepoFullName.split('/')[1]}`;
    const prBody = body || `This pull request merges changes from virtual repository "${compareRepoFullName}" into "${repoFullName}".\n\n**Virtual Repository:** ${compareRepoFullName}\n**Base Repository:** ${repoFullName}\n\nCreated at: ${new Date().toISOString()}`;
    
    // ========== YENİ KOD: Firebase Authentication-dan istifadəçi məlumatlarını al ==========
    let dpsUserData = null;
    const userUid = uid || userId;
    
    if (userUid) {
      try {
        // Firebase Authentication-dan istifadəçi məlumatlarını al
        const userRecord = await admin.auth().getUser(userUid);
        
        dpsUserData = {
          uid: userUid,
          email: userRecord.email || null,
          displayName: userRecord.displayName || null,
          photoURL: userRecord.photoURL || null,
          createdAt: userRecord.metadata.creationTime ? admin.firestore.Timestamp.fromDate(new Date(userRecord.metadata.creationTime)) : now,
          lastSignInTime: userRecord.metadata.lastSignInTime ? admin.firestore.Timestamp.fromDate(new Date(userRecord.metadata.lastSignInTime)) : now
        };
        
        console.log(`✅ User data fetched from Firebase Auth: ${dpsUserData.displayName || dpsUserData.email}`);
      } catch (authError) {
        console.warn(`⚠️ Could not fetch user data from Firebase Auth for UID ${userUid}:`, authError.message);
        // Əgər Firebase Authentication-dan məlumat ala bilməsək, sadə versiyasını yaradaq
        dpsUserData = {
          uid: userUid,
          email: null,
          displayName: null,
          photoURL: null,
          createdAt: now,
          lastSignInTime: now
        };
      }
    }
    // ========== YENİ KOD SONU ==========
    
    // Helper function to get GitHub access token for user
    const getGitHubToken = async (userId) => {
      if (!userId) return null;
      try {
        const userTokenDoc = await db.collection('user_tokens').doc(userId).get();
        if (userTokenDoc.exists) {
          return userTokenDoc.data().accessToken;
        }
        return null;
      } catch (error) {
        console.error("Error getting GitHub token:", error);
        return null;
      }
    };

    // Helper function to fetch file content from GitHub
    const fetchFileContent = async (node, githubToken) => {
      try {
        if (!node.githubRepoFullName || !node.githubPath) {
          console.log(`Missing data for node:`, node.id, node.name);
          return null;
        }

        const [owner, repo] = node.githubRepoFullName.split('/');
        if (!owner || !repo) {
          console.log(`Invalid repo format: ${node.githubRepoFullName}`);
          return null;
        }

        const branch = node.githubBranch || 'main';
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${node.githubPath}`;
        
        console.log(`Fetching file from: ${url}, branch: ${branch}`);

        const response = await axios.get(url, {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Node.js'
          },
          params: {
            ref: branch
          },
          timeout: 10000
        });

        if (response.data && response.data.content && response.data.encoding === 'base64') {
          const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
          console.log(`Successfully fetched file: ${node.githubPath}, size: ${response.data.size} bytes`);
          
          // Return file info with content
          return {
            id: node.id,
            name: node.name,
            githubRepoFullName: node.githubRepoFullName,
            githubPath: node.githubPath,
            githubBranch: node.githubBranch || 'main',
            pathName: node.pathName || node.githubPath,
            fileContent: content, // Add fileContent field
            fileSize: response.data.size || 0,
            fileSha: response.data.sha,
            fileHtmlUrl: response.data.html_url,
            fileDownloadUrl: response.data.download_url,
            contentStatus: 200
          };
        }
        
        console.log(`No content found for: ${node.githubPath}`);
        return null;
      } catch (error) {
        console.error(`Error fetching file ${node.githubPath}:`, error.message);
        if (error.response) {
          console.error(`GitHub API error status: ${error.response.status}, data:`, error.response.data);
        }
        return null;
      }
    };

    // Fetch file contents for selected nodes if they exist
    let updatedSelectedNodes = [];
    let fileResponses = [];
    if (selectedNodes && Array.isArray(selectedNodes) && selectedNodes.length > 0) {
      try {
        const githubToken = await getGitHubToken(userId || uid);
        
        if (githubToken) {
          console.log(`GitHub token found, fetching file contents for ${selectedNodes.length} selected nodes...`);
          
          // Fetch files sequentially to avoid rate limiting and issues
          for (const node of selectedNodes) {
            try {
              console.log(`Fetching file: ${node.githubPath}`);
              const fileData = await fetchFileContent(node, githubToken);
              
              if (fileData) {
                // Merge fileData with original node data
                const updatedNode = {
                  ...node, // Keep all original fields
                  ...fileData, // Add file content and metadata
                  files: {
                    content: fileData.fileContent,
                    size: fileData.fileSize,
                    sha: fileData.fileSha,
                    html_url: fileData.fileHtmlUrl,
                    download_url: fileData.fileDownloadUrl,
                    status: 200
                  }
                };
                updatedSelectedNodes.push(updatedNode);
                fileResponses.push({
                  nodeId: node.id,
                  content: fileData.fileContent,
                  status: 200
                });
                console.log(`✅ Successfully fetched content for: ${node.name}`);
              } else {
                // If content fetch failed, add files field with null content
                const failedNode = {
                  ...node,
                  files: {
                    content: null,
                    status: 404,
                    error: "Failed to fetch content"
                  },
                  contentStatus: 404
                };
                updatedSelectedNodes.push(failedNode);
                fileResponses.push({
                  nodeId: node.id,
                  content: null,
                  status: 404,
                  error: "Failed to fetch content"
                });
                console.log(`❌ Failed to fetch content for: ${node.name}`);
              }
              
              // Small delay between requests
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (nodeError) {
              console.error(`Error processing node ${node.name}:`, nodeError);
              const errorNode = {
                ...node,
                files: {
                  content: null,
                  status: 500,
                  error: nodeError.message
                },
                contentStatus: 500
              };
              updatedSelectedNodes.push(errorNode);
              fileResponses.push({
                nodeId: node.id,
                content: null,
                status: 500,
                error: nodeError.message
              });
            }
          }
          
          console.log(`Successfully fetched content for ${updatedSelectedNodes.filter(n => n.files?.content).length} file(s) out of ${selectedNodes.length} selected nodes`);
        } else {
          console.warn("No GitHub token found, skipping file content fetching");
          // If no token, add empty files field
          updatedSelectedNodes = selectedNodes.map(node => ({
            ...node,
            files: {
              content: null,
              status: 401,
              error: "No GitHub token available"
            },
            contentStatus: 401
          }));
        }
      } catch (error) {
        console.error("Error fetching file contents:", error);
        // If error, add empty files field
        updatedSelectedNodes = selectedNodes.map(node => ({
          ...node,
          files: {
            content: null,
            status: 500,
            error: error.message
          },
          contentStatus: 500
        }));
      }
    } else {
      console.log("No selected nodes provided, skipping file content fetching");
      updatedSelectedNodes = selectedNodes || [];
    }

    // ========== YENİ KOD: dps_user field-i əlavə edilmiş PR data ==========
    // ========== YENİ KOD: treeData və ownSelectedData field-ləri əlavə edilmiş PR data ==========
    const prData = {
      prNumber: prNumber,
      title: prTitle,
      body: prBody,
      state: "open", 
      html_url: null, 
      url: null,
      repoFullName: repoFullName,
      compareRepoFullName: compareRepoFullName,
      projectId: projectId || null,
      githubRepoId: githubRepoId || null,
      createdBy: userId || uid || null,
      selectedNodes: updatedSelectedNodes, // Use updated nodes with files field
      filesFetched: updatedSelectedNodes.some(n => n.files?.content), // Flag to indicate if any files were fetched
      createdAt: now,
      updatedAt: now,
      head: {
        ref: `virtual-repo-${compareRepoFullName.split('/')[1]}-${Date.now()}`,
        repo: {
          full_name: compareRepoFullName
        }
      },
      base: {
        ref: base || "main",
        repo: {
          full_name: repoFullName
        }
      },
      // YENİ FIELD: Firebase Authentication-dan alınan istifadəçi məlumatları
      dps_user: dpsUserData ? [dpsUserData] : [],
      // YENİ FIELD: Bütün tree structure
      treeData: treeData || [],
      // YENİ FIELD: Seçilmiş node'lar
      ownSelectedData: selectedNodes || []
    };
    // ========== YENİ KOD SONU ==========

    // Save to pull_requests collection
    const prDocRef = await db.collection("pull_requests").add(prData);
    console.log(`✅ Pull request saved to Firestore with ID: ${prDocRef.id}, PR Number: ${prNumber}`);
    
    const successfulFetches = updatedSelectedNodes.filter(n => n.files?.content).length;
    console.log(`✅ Content fetched for ${successfulFetches} out of ${selectedNodes?.length || 0} files`);

    // ========== crd_pull_requests collection oluştur ==========
    if (projectId && githubRepoId) {
      try {
        const crdDocumentId = `${projectId}_${githubRepoId}`;
        const crdPullRequestsRef = db.collection("crd_pull_requests").doc(crdDocumentId);
        
        // Create base crdData with updatedSelectedNodes
        const crdData = {
          pull_requests: [prData], // Include updatedSelectedNodes with files field in the PR data
          createdDate: now,
          updatedDates: [now],
          createdBy: userId || uid || null,
          updatedBys: [userId || uid || null],
          projectId: projectId,
          githubRepoId: githubRepoId,
          lastUpdatedAt: now
        };

        // Check if document already exists
        const existingDoc = await crdPullRequestsRef.get();
        
        if (existingDoc.exists) {
          // Document exists, update it
          await crdPullRequestsRef.update({
            pull_requests: FieldValue.arrayUnion(prData), // Add new PR with files in selectedNodes AND dps_user field AND treeData AND ownSelectedData
            updatedDates: FieldValue.arrayUnion(now),
            updatedBys: FieldValue.arrayUnion(userId || uid || null),
            lastUpdatedAt: now
          });
          console.log(`✅ Updated existing crd_pull_requests document: ${crdDocumentId}`);
        } else {
          // Document doesn't exist, create it
          await crdPullRequestsRef.set(crdData);
          console.log(`✅ Created new crd_pull_requests document: ${crdDocumentId}`);
        }
      } catch (error) {
        console.error("Error creating/updating crd_pull_requests:", error);
        // Continue with main flow even if this fails
      }
    } else {
      console.log("⚠️  projectId or githubRepoId missing, skipping crd_pull_requests creation");
    }
    // ========== crd_pull_requests SONU ==========

    // Get project name if projectId exists
    let projectName = null;
    if (projectId) {
      try {
        const projectDoc = await db.collection("projects").doc(projectId).get();
        if (projectDoc.exists) {
          projectName = projectDoc.data().name;
        }
      } catch (error) {
        console.error("Error fetching project name:", error);
      }
    }

    let projectMembers = [];
    if (projectId) {
      try {
        const projectPermissionDoc = await db.collection("project_permissions").doc(projectId).get();
        if (projectPermissionDoc.exists) {
          const projectPermissionData = projectPermissionDoc.data();
          const userList = projectPermissionData.user_list || [];
          projectMembers = userList.map((user) => ({ uid: user.uid }));
        }
      } catch (error) {
        console.error("Error fetching project members:", error);
      }
    }

    // Create notifications for relevant users
    const notificationPromises = [];
    const notifiedUserIds = new Set();

    // Add project members
    projectMembers.forEach((member) => {
      if (member.uid) {
        notifiedUserIds.add(member.uid);
      }
    });

    // Add creator if not already in list
    const creatorUid = uid || userId;
    if (creatorUid) {
      notifiedUserIds.add(creatorUid);
    }

    // Import email service and notification counter
    const { sendPullRequestNotificationEmail, getUserEmail } = await import("../../../utility/emailService.js");
    const { getNextNotificationNumber } = await import("../../../utility/notificationCounter.js");
    
    // Get next notification number
    const notificationNumber = await getNextNotificationNumber(db);

    // Get creator name once (outside loop) - Handle auth errors
    let creatorName = 'Someone';
    if (creatorUid) {
      try {
        const creatorUser = await admin.auth().getUser(creatorUid);
        creatorName = creatorUser.displayName || creatorUser.email || 'Someone';
      } catch (error) {
        console.warn(`Could not get creator name for ${creatorUid}:`, error.message);
        creatorName = 'A team member';
      }
    }

    for (const userUid of notifiedUserIds) {
      if (!userUid) {
        continue;
      }
      
      const notificationCollectionName = `${userUid}_notifications`;
      
      // Get user email and name - Handle auth errors
      const userEmail = await getUserEmail(admin, userUid);
      let userName = null;
      try {
        const userRecord = await admin.auth().getUser(userUid);
        userName = userRecord.displayName || userRecord.email || 'User';
      } catch (error) {
        console.warn(`Could not get user name for ${userUid}:`, error.message);
        userName = 'Team Member';
      }

      // Include file count in notification
      const fileCount = updatedSelectedNodes.filter(n => n.files?.content).length;
      const fileCountMessage = fileCount > 0 ? ` (includes ${fileCount} file${fileCount > 1 ? 's' : ''} with content)` : '';

      const notificationData = {
        type: "pull_request",
        title: `New Pull Request: ${prTitle}`,
        message: `A new pull request has been created in ${repoFullName}${fileCountMessage}`,
        pullRequestId: prDocRef.id,
        prNumber: prNumber,
        notificationNumber: notificationNumber,
        repoFullName: repoFullName,
        compareRepoFullName: compareRepoFullName,
        projectId: projectId || null,
        description: prBody,
        body: prBody,
        read: false,
        userId: String(userUid),
        emailSent: false,
        fileCount: fileCount,
        createdAt: now,
        updatedAt: now,
      };

      // Send email notification
      if (userEmail) {
        try {
          const emailResult = await sendPullRequestNotificationEmail({
            userEmail: userEmail,
            userName: userName,
            prNumber: prNumber,
            prTitle: prTitle,
            createdByName: creatorName,
            projectName: projectName,
            repoFullName: repoFullName,
            compareRepoFullName: compareRepoFullName,
            prBody: prBody,
            notificationNumber: notificationNumber,
            pullRequestId: prDocRef.id,
            fileCount: fileCount
          });
          
          if (emailResult.success) {
            notificationData.emailSent = true;
            console.log(`✅ Email sent to user ${userUid}: ${userEmail}`);
          }
        } catch (error) {
          console.error(`Error sending email to user ${userUid}:`, error);
        }
      }

      notificationPromises.push(
        db.collection(notificationCollectionName).add(notificationData)
      );
    }

    await Promise.all(notificationPromises);

    // Return response
    return res.status(200).json({
      success: true,
      pullRequest: {
        number: prNumber,
        title: prTitle,
        body: prBody,
        state: "open",
        html_url: null,
        url: null,
        head: prData.head,
        base: prData.base,
        selectedNodesCount: updatedSelectedNodes.length,
        filesWithContentCount: updatedSelectedNodes.filter(n => n.files?.content).length,
        // YENİ: dps_user məlumatlarını da response-a əlavə et
        dps_user: dpsUserData ? [{
          uid: dpsUserData.uid,
          email: dpsUserData.email,
          displayName: dpsUserData.displayName,
          photoURL: dpsUserData.photoURL
        }] : [],
        // YENİ: treeData və ownSelectedData response-a əlavə et
        treeData: treeData ? true : false,
        ownSelectedData: selectedNodes ? (Array.isArray(selectedNodes) ? selectedNodes.length : 0) : 0
      },
      pullRequestId: prDocRef.id,
      crdDocumentId: projectId && githubRepoId ? `${projectId}_${githubRepoId}` : null,
      selectedNodes: updatedSelectedNodes.map(node => ({
        id: node.id,
        name: node.name,
        githubRepoFullName: node.githubRepoFullName,
        githubPath: node.githubPath,
        githubBranch: node.githubBranch,
        pathName: node.pathName,
        files: node.files || {
          content: null,
          status: 404
        }
      })),
      status: 200,
    });
  } catch (error) {
    console.error("createPullRequest Error:", error);

    const status = error.status || 500;
    const message =
      error.response?.data?.message ||
      error.message ||
      "Failed to create pull request";

    return res.status(status).json({
      success: false,
      error: message,
      details: error.response?.data,
      status,
    });
  }
};

export default createPullRequest;