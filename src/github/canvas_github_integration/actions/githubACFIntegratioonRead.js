import { db } from "../../../../config/firebase.js";

const githubACFIntegrationRead = async (req, res) => {
  const { type } = req.body;

  if (!type) {
    return res.status(400).json({
      status: 400,
      error: "Missing required field: type (document ID)",
    });
  }

  try {
    const docRef = db.collection("canvas_git_file_relation").doc(type);
    const docSnapshot = await docRef.get();

    if (!docSnapshot.exists) {
      return res.status(201).json({
        status: 201,
        message: `No document found for ID "${type}"`,
      });
    }

    const data = docSnapshot.data();

    return res.status(200).json({
      status: 200,
      message: `Fetched document for ID "${type}"`,
      data: {
        id: docSnapshot.id,
        ...data,
      }
    });

  } catch (error) {
    console.error("Error reading canvas_git_file_relation:", error);
    return res.status(500).json({
      status: 500,
      error: "Internal server error",
      message: error.message,
    });
  }
};

export default githubACFIntegrationRead;
