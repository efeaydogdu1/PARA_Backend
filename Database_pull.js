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
        
        freeElectives: -5,
        coreElectives: -2,
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
function recommendCourses(degreeRequirements, remainingCredits, creditsOfCoursesData, allCoursesData, transcript) {
    // Extract just the course codes from the transcript into a Set for easier checking
    let takenCourseCodes = new Set(transcript.academic_history.flatMap(term => term.courses.map(course => course.code))
                                    .concat(transcript.current_courses.courses.map(course => course.code)));

    let recommendedCourses = [];

    // Go through each pool and get potential courses
    for (const pool of ['areaElectives', 'freeElectives', 'coreElectives', 'requiredCourses', 'universityCourses']) {
        if (remainingCredits[pool] > 0) {
            let potentialCourses = degreeRequirements[pool].filter(course => !takenCourseCodes.has(course));

            // Now, filter based on prerequisites and credit reduction
            let poolRecommendedCourses = potentialCourses
                .filter(courseCode => {
                    const courseDetails = allCoursesData.find(course => course.courseCode === courseCode);
                    if (courseDetails && courseDetails.preRequisities) {
                        // Check if all prerequisites are met
                        return courseDetails.preRequisities.every(prerequisite => takenCourseCodes.has(prerequisite));
                    }
                    return true; // If there are no prerequisites, the course is eligible
                })
                .filter(courseCode => {
                    const courseData = creditsOfCoursesData.find(c => c.courseCode === courseCode || c.previousCourseCode === courseCode);
                    // Check if the course helps in reducing remaining credits
                    return courseData && (
                        (remainingCredits.basicScienceECTS > 0 && courseData.after2013basicScienceECTS > 0) ||
                        (remainingCredits.engineeringECTS > 0 && courseData.after2013engineeringECTS > 0)
                    );
                });

            recommendedCourses = [...recommendedCourses, ...poolRecommendedCourses];
        }
    }

    // Slice to get a limited number of recommendations
    return recommendedCourses.slice(0, 30);
}


// The main algorithm that ties everything together
async function courseCategoryAlgorithm(firstAdmitTerm,path) {
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
        const transcript = await pdfReader.parseAndPrintTranscript(path);

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
function formatAdmitSemester(admitSemester) {
    // Regex to match the pattern "Fall 2019-2020"
    // It captures the season part and the year range part separately
    // This regex will ensure spaces around the hyphen are properly managed.
    const regex = /(\w+)\s(\d{4})-(\d{4})/;

    // Replace and reformat the string using the captured groups
    // The $2 and $3 refer to the captured year parts, and $1 refers to the semester part.
    // We're adding spaces around the hyphen for correct formatting.
    return admitSemester.replace(regex, '$2 - $3 / $1');
}
const path = 'C:\\Users\\Public\\PARA-backend\\Transcript.pdf';
// Execute the function with the specific term
async function run() {
    const transcript = await pdfReader.parseAndPrintTranscript(path);
    const formattedTerm = formatAdmitSemester(transcript.student_info.admit_semester);
        
    try {
        const result = await courseCategoryAlgorithm(formattedTerm, path);
        console.log("Result:", result);
    } catch (error) {
        console.error("Failed to execute course category algorithm:", error);
    }
}


module.exports = {courseCategoryAlgorithm,parseAndPrintTranscript,formatAdmitSemester};




