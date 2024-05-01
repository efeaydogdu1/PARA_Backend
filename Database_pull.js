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
async function getCourseHeights() {
    await initFirebaseHandler("courseHeights");
    const heightsData = await FirebaseHandler.readAll();
    const heightsMap = {};
    heightsData.forEach(doc => {
        heightsMap[doc.courseCode] = doc.Height;
    });
    return heightsMap;
}
// Counts how many courses of each type a student has taken based on their transcript and degree requirements
function countCoursesInCategories(transcript, degreeRequirement, creditsOfCoursesData) {
    let counts = {
        
        freeElectives: -5,
        coreElectives: -5,
        requiredCourses: 0,
        universityCourses: 0,
        areaElectives: -2,
        basicScienceECTS: -15,
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
async function recommendCourses(degreeRequirements, remainingCredits, creditsOfCoursesData, allCoursesData, transcript) {
    let takenCourseCodes = new Set(transcript.academic_history.flatMap(term => term.courses.map(course => course.code))
                                    .concat(transcript.current_courses.courses.map(course => course.code)));

    const courseHeights = await getCourseHeights(); // Fetch course heights for scoring
    let recommendationsByPool = {};

    for (const pool of ['areaElectives', 'freeElectives', 'coreElectives', 'requiredCourses', 'universityCourses']) {
        if (remainingCredits[pool] > 0) {
            let potentialCourses = degreeRequirements[pool].filter(course => !takenCourseCodes.has(course));

            let poolRecommendedCourses = potentialCourses
                .filter(courseCode => {
                    const courseDetails = allCoursesData.find(course => course.courseCode === courseCode);
                    return courseDetails && courseDetails.preRequisities ? 
                           courseDetails.preRequisities.every(prerequisite => takenCourseCodes.has(prerequisite)) : 
                           true;
                })
                .filter(courseCode => {
                    const courseData = creditsOfCoursesData.find(c => c.courseCode === courseCode || c.previousCourseCode === courseCode);
                    return courseData && (
                        (remainingCredits.basicScienceECTS > 0 && courseData.after2013basicScienceECTS > 0) ||
                        (remainingCredits.engineeringECTS > 0 && courseData.after2013engineeringECTS > 0)
                    );
                })
                .map(courseCode => ({ // Use map here to attach height for sorting
                    courseCode,
                    score: (courseHeights[courseCode] || 0) // Incorporate course height into score
                }))
                .sort((a, b) => b.score - a.score) // Sort by score descending, which is by height here
                .map(course => course.courseCode); // Convert back to course codes for output

            recommendationsByPool[pool] = poolRecommendedCourses.slice(0, 10); // Limit to top 5 recommendations per pool
        } else {
            recommendationsByPool[pool] = []; // No recommendations if pool credit requirement is met
        }
    }

    return recommendationsByPool;
}

async function courseCategoryAlgorithm(firstAdmitTerm, path) {
    try {
        await initFirebaseHandler("degreeRequirements");
        const degreeRequirements = await getDegreeRequirements(firstAdmitTerm);
        
        await initFirebaseHandler("creditsOfCourses");
        const creditsOfCoursesData = await getCreditsOfCourses();
        
        await initFirebaseHandler("allCourses");
        const allCoursesData = await getAllCourses();
        
        const transcript = await pdfReader.parseAndPrintTranscript(path);
        
        const counts = countCoursesInCategories(transcript, degreeRequirements, creditsOfCoursesData);
        const remainingCredits = calculateRemainingCredits(counts, degreeRequirements);
        
        const recommendations = await recommendCourses(degreeRequirements, remainingCredits, creditsOfCoursesData, allCoursesData, transcript);

        console.log("Category Counts:", counts);
        console.log("Remaining Credits:", remainingCredits);
        console.log("Recommendations by Pool:", recommendations);

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


module.exports = {courseCategoryAlgorithm,formatAdmitSemester};




