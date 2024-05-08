const FirebaseHandler = require("./firebase.js");

async function initFirebaseHandler(collectionName) {
    await FirebaseHandler.get(collectionName);
}

async function getAllCourseCapacities() {
    await initFirebaseHandler("capacityStatus");
    return FirebaseHandler.readAll();
}

async function calculateAndStoreRiskValues() {
    const courseCapacities = await getAllCourseCapacities();
    const courseRiskData = {};

    // Initialize course data structure
    courseCapacities.forEach(entry => {
        if (!courseRiskData[entry.courseCode]) {
            courseRiskData[entry.courseCode] = {
                totalCapacity: 0,
                totalTaken: 0,
                favoredProfessorCapacity: 0,
                favoredProfessorTaken: 0,
                favoredProfessor: null,
                latestTerm: entry.term
            };
        }

        const data = courseRiskData[entry.courseCode];
        data.totalCapacity += entry.capacity;
        data.totalTaken += entry.taken;

        // Update favored professor and their data
        if (entry.term > data.latestTerm || data.favoredProfessor === null) {
            data.latestTerm = entry.term;
            data.favoredProfessor = entry.professor;
            data.favoredProfessorCapacity = 0;  // Reset for the latest term
            data.favoredProfessorTaken = 0;
        }

        // Aggregate data for the favored professor in the latest term
        if (entry.professor === data.favoredProfessor && entry.term === data.latestTerm) {
            data.favoredProfessorCapacity += entry.capacity;
            data.favoredProfessorTaken += entry.taken;
        }
    });

    // Calculate risk values and populate the new collection
    await initFirebaseHandler("riskValuesCourses");
    for (const [courseCode, data] of Object.entries(courseRiskData)) {
        const totalRiskRatio = data.totalTaken / data.totalCapacity;
        const favoredProfessorRiskRatio = data.favoredProfessorCapacity > 0 ? data.favoredProfessorTaken / data.favoredProfessorCapacity : 0;  // Avoid division by zero

        const riskValueDocument = {
            courseCode,
            totalCapacity: data.totalCapacity,
            totalTaken: data.totalTaken,
            totalRiskRatio,
            favoredProfessor: data.favoredProfessor,
            favoredProfessorCapacity: data.favoredProfessorCapacity,
            favoredProfessorTaken: data.favoredProfessorTaken,
            favoredProfessorRiskRatio
        };
        await FirebaseHandler.create(riskValueDocument);  // Store in Firestore
    }
}

/*calculateAndStoreRiskValues()
    .then(() => console.log("Risk values calculated and stored successfully"))
    .catch(error => console.error("Error calculating risk values:", error));*/
async function displayFirstFiveRiskValues() {
        await initFirebaseHandler("riskValuesCourses");
        
        // Fetch the first five documents
        const querySnapshot = await FirebaseHandler.collection.limit(5).get();
        const documents = [];
    
        querySnapshot.forEach(doc => {
            if (doc.exists) {
                documents.push(doc.data());
            }
        });
    
        console.log("First 5 documents in 'riskValuesCourses':");
        console.log(documents);
    }
    
    displayFirstFiveRiskValues()
        .then(() => console.log("Displayed first five risk values."))
        .catch(error => console.error("Failed to display risk values:", error));