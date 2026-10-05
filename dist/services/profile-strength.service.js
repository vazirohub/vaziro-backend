"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileStrengthService = void 0;
class ProfileStrengthService {
    /**
     * Deterministic server-side calculation of profile completeness
     */
    static calculate(profile) {
        const user = profile?.user || {};
        const verification = profile?.verification || {};
        const skills = Array.isArray(profile?.skills) ? profile.skills : [];
        const serviceAreas = Array.isArray(profile?.serviceAreas) ? profile.serviceAreas : [];
        const payouts = Array.isArray(profile?.payouts) ? profile.payouts : [];
        const hasLinkedAccount = Boolean(profile?.linkedAccount?.razorpayAccountId || profile?.linkedAccount?.accountNumberMasked);
        const items = [
            {
                id: 'photo',
                label: 'Add a profile photo',
                weight: 10,
                completed: Boolean(profile?.avatarUrl && profile.avatarUrl.trim().length > 5),
                actionKey: 'photo',
                actionLabel: 'Upload Photo',
            },
            {
                id: 'basic_info',
                label: 'Name and professional headline',
                weight: 5,
                completed: Boolean(user.firstName &&
                    user.firstName.trim().length > 1 &&
                    profile?.title &&
                    profile.title.trim().length > 2),
                actionKey: 'basic',
                actionLabel: 'Edit Headline',
            },
            {
                id: 'bio',
                label: 'Write an About Me bio (min 30 characters)',
                weight: 10,
                completed: Boolean(profile?.bio && profile.bio.trim().length >= 30),
                actionKey: 'bio',
                actionLabel: 'Write Bio',
            },
            {
                id: 'category',
                label: 'Select primary category and service description',
                weight: 10,
                completed: Boolean(profile?.categoryId || (profile?.serviceDescription && profile.serviceDescription.trim().length > 10)),
                actionKey: 'category',
                actionLabel: 'Choose Category',
            },
            {
                id: 'experience',
                label: 'Add your work experience',
                weight: 10,
                completed: Boolean((profile?.yearsOfExperience && profile.yearsOfExperience > 0) ||
                    (profile?.experienceDescription && profile.experienceDescription.trim().length > 15)),
                actionKey: 'experience',
                actionLabel: 'Add Experience',
            },
            {
                id: 'skills',
                label: 'Add at least one professional skill',
                weight: 10,
                completed: skills.length > 0,
                actionKey: 'skills',
                actionLabel: 'Select Skills',
            },
            {
                id: 'location',
                label: 'Add your service areas',
                weight: 10,
                completed: serviceAreas.length > 0,
                actionKey: 'location',
                actionLabel: 'Add Service Areas',
            },
            {
                id: 'availability',
                label: 'Complete your working availability and hours',
                weight: 5,
                completed: Boolean(profile?.availabilityStatus &&
                    (profile?.workingDays || profile?.workingHours)),
                actionKey: 'availability',
                actionLabel: 'Set Availability',
            },
            {
                id: 'languages',
                label: 'Specify spoken languages',
                weight: 5,
                completed: Boolean(profile?.languages && profile.languages.trim().length > 2),
                actionKey: 'languages',
                actionLabel: 'Add Languages',
            },
            {
                id: 'qualifications',
                label: 'Add qualifications or certifications',
                weight: 5,
                completed: Boolean(profile?.qualifications && profile.qualifications.trim().length > 5),
                actionKey: 'qualifications',
                actionLabel: 'Add Qualifications',
            },
            {
                id: 'digilocker',
                label: 'Verify your identity through DigiLocker',
                weight: 15,
                completed: verification?.status === 'VERIFIED',
                actionKey: 'verification',
                actionLabel: 'Verify with DigiLocker',
            },
            {
                id: 'payouts',
                label: 'Add bank / payout account details',
                weight: 5,
                completed: hasLinkedAccount || payouts.length > 0,
                actionKey: 'payouts',
                actionLabel: 'Add Payout Details',
            },
        ];
        let totalScore = 0;
        const completedItems = [];
        const missingItems = [];
        for (const item of items) {
            if (item.completed) {
                totalScore += item.weight;
                completedItems.push(item);
            }
            else {
                missingItems.push(item);
            }
        }
        const score = Math.min(100, Math.max(0, Math.round(totalScore)));
        let level = 'INCOMPLETE';
        let levelLabel = 'Incomplete';
        if (score >= 100) {
            level = 'COMPLETE';
            levelLabel = 'Complete';
        }
        else if (score >= 90) {
            level = 'STRONG';
            levelLabel = 'Strong';
        }
        else if (score >= 70) {
            level = 'GOOD';
            levelLabel = 'Good';
        }
        else if (score >= 40) {
            level = 'BASIC';
            levelLabel = 'Basic';
        }
        const recommendations = missingItems.map((item) => ({
            id: item.id,
            label: item.label,
            actionKey: item.actionKey,
            actionLabel: item.actionLabel,
            points: item.weight,
        }));
        return {
            score,
            level,
            levelLabel,
            completedCount: completedItems.length,
            totalCount: items.length,
            missingItems,
            completedItems,
            recommendations,
        };
    }
}
exports.ProfileStrengthService = ProfileStrengthService;
