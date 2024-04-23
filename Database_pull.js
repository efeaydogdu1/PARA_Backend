const FirebaseHandler = require("./firebase.js");
const pdfReader = require("./pdfreader.js");

// Initializes the FirebaseHandler with the collection name
async function initFirebaseHandler(collectionName) {
    await FirebaseHandler.get(collectionName);
}

// Retrieves degree requirements based on the first admit term
async function getDegreeRequirements(firstAdmitTerm) {
    const documentsData = await FirebaseHandler.readAll();
    return documentsData.find(doc => doc.firstAdmitTerm === firstAdmitTerm);
}

// Retrieves credits information for courses
async function getCreditsOfCourses() {
    const creditsData = await FirebaseHandler.readAll();
    return creditsData;
}
async function getAllCourses() {
    await initFirebaseHandler("allCourses");
    return FirebaseHandler.readAll();
}

// Counts how many courses of each type a student has taken based on their transcript and degree requirements
function countCoursesInCategories(transcript, degreeRequirement, creditsOfCoursesData) {
    let counts = {
        
        freeElectives: 0,
        coreElectives: 0,
        requiredCourses: 0,
        universityCourses: 0,
        areaElectives: -2,
        basicScienceECTS: 0,
        engineeringECTS: -70
    };

    function addCredits(courseCode) {
        const courseCredits = creditsOfCoursesData.find(c => c.courseCode === courseCode || c.previousCourseCode === courseCode);
        if (courseCredits) {
            counts.basicScienceECTS += courseCredits.after2013basicScienceECTS || 0;
            counts.engineeringECTS += courseCredits.after2013engineeringECTS || 0;
        }
    }

    function categorizeCourse(course) {
        addCredits(course.code); // add credits to basicScienceECTS and engineeringECTS

        if (degreeRequirement.areaElectives.includes(course.code)) {
            counts.areaElectives++;
        } else if (degreeRequirement.freeElectives.includes(course.code)) {
            counts.freeElectives++;
        } else if (degreeRequirement.coreElectives.includes(course.code)) {
            counts.coreElectives++;
        } else if (degreeRequirement.requiredCourses.includes(course.code)) {
            counts.requiredCourses++;
        } else if (degreeRequirement.universityCourses.includes(course.code)) {
            counts.universityCourses++;
        }
    }

    // Count courses in academic history
    transcript.academic_history.forEach(term => term.courses.forEach(categorizeCourse));
    // Count courses in current courses
    transcript.current_courses.courses.forEach(categorizeCourse);

    return counts;
}

// Calculates the remaining credits based on the counts and degree requirements
function calculateRemainingCredits(counts, degreeRequirement) {
    return {
        areaElectives: Math.max(0, degreeRequirement.areaElectivesMinSU - counts.areaElectives * 3),
        freeElectives: Math.max(0, degreeRequirement.freeElectivesMinSU - counts.freeElectives * 3),
        coreElectives: Math.max(0, degreeRequirement.coreElectivesMinSU - counts.coreElectives * 3),
        requiredCourses: Math.max(0, degreeRequirement.requiredCoursesMinSU - counts.requiredCourses * 3),
        universityCourses: Math.max(0, degreeRequirement.universityCoursesMinSU - counts.universityCourses * 3),
        basicScienceECTS: Math.max(0, degreeRequirement.basicScienceMinECTS - counts.basicScienceECTS),
        engineeringECTS: Math.max(0, degreeRequirement.engineeringMinECTS - counts.engineeringECTS)
    };
}
function recommendCourses(degreeRequirements, remainingCredits, creditsOfCoursesData,allCoursesData, transcript) {
    // Determine which pool has the most remaining credits to fulfill
    let pools = ['areaElectives', 'freeElectives', 'coreElectives', 'requiredCourses', 'universityCourses'];
    let highestPool = pools.reduce((a, b) => remainingCredits[b] > remainingCredits[a] ? b : a);

    // Compile a list of courses already taken to avoid recommending them
    let takenCourses = new Set(transcript.academic_history.flatMap(term => term.courses.map(course => course.code))
                               .concat(transcript.current_courses.courses.map(course => course.code)));

    // Filter out courses from the selected pool that haven't been taken yet
    let potentialCourses = degreeRequirements[highestPool].filter(course => !takenCourses.has(course));

    // Further filter to find courses that could reduce remaining basic science or engineering credits, if needed
    let recommendedCourses = potentialCourses
        .filter(courseCode => {
            // Check if the course has prerequisites in allCoursesData
            let courseInAllCourses = allCoursesData.find(c => c.courseCode === courseCode);
            let coursePrerequisites = courseInAllCourses?.preRequisites || [];
            return coursePrerequisites.every(prerequisite => takenCourses.has(prerequisite));
        })
        .filter(courseCode => {
            // Check if the course helps in reducing remaining credits
            let courseData = creditsOfCoursesData.find(c => c.courseCode === courseCode || c.previousCourseCode === courseCode);
            return courseData && (
                (remainingCredits.basicScienceECTS > 0 && courseData.after2013basicScienceECTS > 0) ||
                (remainingCredits.engineeringECTS > 0 && courseData.after2013engineeringECTS > 0)
            );
        })
        .slice(0,30); // Limit to 5 recommendations for brevity

    return {
        highestPool: highestPool,
        recommendedCourses: recommendedCourses
    };
}

// The main algorithm that ties everything together
async function courseCategoryAlgorithm(firstAdmitTerm) {
    try {
        // Initialize the Firebase handler for different collections
        await initFirebaseHandler("degreeRequirements");
        const degreeRequirements = await getDegreeRequirements(firstAdmitTerm);
        
        await initFirebaseHandler("creditsOfCourses");
        const creditsOfCoursesData = await getCreditsOfCourses();
        
        // Make sure to initialize and retrieve all courses data
        await initFirebaseHandler("allCourses");
        const allCoursesData = await getAllCourses();
        
        // Read the transcript
        const transcript = await pdfReader.parseAndPrintTranscript('C:\\Users\\Public\\PARA-backend\\Transcript.pdf');

        // Process the counts and remaining credits
        const counts = countCoursesInCategories(transcript, degreeRequirements, creditsOfCoursesData);
        const remainingCredits = calculateRemainingCredits(counts, degreeRequirements);

        // Add remaining credits to the counts object for logging
        counts.remainingBasicScienceECTS = Math.max(0, degreeRequirements.basicScienceMinECTS - counts.basicScienceECTS);
        counts.remainingEngineeringECTS = Math.max(0, degreeRequirements.engineeringMinECTS - counts.engineeringECTS);

        // Call the recommendCourses function with all necessary data
        const recommendations = await recommendCourses(degreeRequirements, remainingCredits, creditsOfCoursesData, allCoursesData, transcript);

        // Log the results
        console.log("Category Counts:", counts);
        console.log("Remaining Credits:", remainingCredits);
        console.log("Recommendations:", recommendations);

        // Return the processed data
        return { counts, remainingCredits, recommendations };
    } catch (error) {
        console.error("Error in course category algorithm:", error);
        throw error;
    }
}
// Execute the function with the specific term
courseCategoryAlgorithm('2019 - 2020 / Fall')
    .then(result => {
        console.log("Result:", result);
    })
    .catch(error => {
        console.error("Failed to calculate course counts:", error);
    });







