# Stitch UI Integration Master Plan

## Todo List

- [x] Audit existing codebase structure and Stitch design files (COMPLETED ✓)
- [~] Create comprehensive Stitch UI Integration Plan (current phase)
- [ ] Review and finalize the implementation plan
- [ ] Execute plan: Step 1 - Audit and mapping (COMPLETED ✓)
- [x] Execute plan: Step 2 - Design tokens integration (COMPLETED ✓)
- [x] Execute plan: Step 3 - Shared shell/navigation (COMPLETED ✓)
- [x] Execute plan: Step 4 - Document workspace integration (COMPLETED ✓)
- [x] Execute plan: Step 5 - OCR verification UI (COMPLETED ✓)
- [x] Execute plan: Step 6 - Tutor panel integration (COMPLETED ✓)
- [ ] Execute plan: Step 7 - Study session integration
- [ ] Execute plan: Step 8 - Library/navigation integration
- [ ] Execute plan: Step 9 - Verification and testing

## Project Context

This plan outlines the integration of the Stitch AI Study Agent UI/UX design system into the existing AI Study Agent codebase. The goal is to implement the Stitch visual design while preserving all existing backend functionality, data flows, and Phase 5 study session capabilities.

## Current System Baseline

### Existing Application Core
- **Stack**: Next.js 16 App Router TypeScript, Supabase (Auth/Postgres/Storage), Tailwind
- **Routes**: `/login`, `/`, `/library`, `/study`, `/study/new`, `/study/[id]`, `/topics`, `/tutor`
- **API Areas**: Resource management, study sessions, topics, tutoring
- **Key Components**: StudyShell, DocumentWorkspace, TutorChat, UploadForm, TopicCard, etc.
- **Backend**: Supabase PostgreSQL, OCR pipeline (`lib/documents/ocr.ts`, `lib/documents/pdf.ts`), AI tutor service (`lib/tutor/`)

### Existing Phase 5 Functionality (Must Preserve)
- Study session lifecycle (create → answer → record attempts → end)
- Mastery tracking and mistake analysis
- AI tutor with grounded citations and retrieval
- PDF processing with OCR fallback and page awareness
- Topic assignment and progress tracking

## Stitch Design System Analysis

### Visual Language Principles
- **Dark academic interface**: slate surfaces (`#0b1326`, `#0f172a`), indigo primary (`#6366f1`), emerald success (`#10b981`), cyan info (`#06b6d4`), amber warning (`#f59e0b`), red error (`#ef4444`)
- **Typography**: Inter font family with specific scale (display-lg: 3.5rem, headline-md: 1.5rem, body-lg: 1.125rem)
- **Layout**: 12-column modular grid, responsive desktop/tablet/mobile breakpoints
- **Elevation**: Minimalist borders and tonal shifts, no excessive glassmorphism
- **Spacing**: 4px/8px rhythm, 260px navigation, 60% central canvas, 400px AI assistant area

### Stitch Component Architecture
1. **StudyShell**: Main navigation container with responsive sidebar
2. **StudyHeader**: Academic context header with breadcrumbs and controls
3. **DocumentWorkspace**: Primary PDF/OCR view with split-screen layout
4. **DocumentToolbar**: PDF navigation, zoom, and view controls
5. **DocumentPage**: Individual page display with academic formatting
6. **DocumentMetadata**: Page-aware document information and academic context
7. **DocumentAnnotation**: Tutor marginalia and academic annotations
8. **OcrConfidenceBadge**: OCR confidence indicators and grounding
9. **OcrVerificationPanel**: Multimodal OCR verification interface
10. **CitationBadge**: Grounded source citations and reference indicators
11. **TutorPanel**: AI tutor integration with contextual prompts
12. **StudyControls**: Session management and study actions

## Integration Strategy

### Phase 1: Audit & Mapping (Week 1)
1.1 **Analyze Stitch HTML/JS Components**
   - Deconstruct `code.html` into reusable React components
   - Identify Stitch component patterns and data flow
   - Map Stitch visual states to existing application data

1.2 **Create Component Mapping**
```
Stitch Element → Existing Route → Existing Component → Existing Data/API → New Component
```

1.3 **Establish Design Token Alignment**
   - Map Stitch color palette to existing Tailwind CSS
   - Align Stitch typography scale with Inter font usage
   - Standardize spacing and layout patterns

### Phase 2: Design Tokens Integration (Week 2)
2.1 **Update Tailwind Configuration**
   - Add Stitch colors to `globals.css` theme variables
   - Define typography scale for headings, body text, and code blocks
   - Establish spacing rhythm and border radius system

2.2 **Create Design Token Provider**
   - Centralized design token management
   - Dark mode optimization and accessibility compliance
   - Component-level token override capabilities

### Phase 3: Shared Shell & Navigation (Week 3)
3.1 **Enhance StudyShell**
   - Integrate Stitch navigation styling and layout
   - Responsive mobile drawer implementation
   - Academic header with breadcrumbs

3.2 **Update Header Actions**
   - Upload material button with Stitch styling
   - Study sessions and tutor navigation integration
   - Academic brand consistency across all shells

3.3 **Responsive Navigation**
   - Desktop: Fixed 260px sidebar with Stitch academic styling
   - Tablet: Adaptive two-column layout
   - Mobile: Collapsible drawer navigation

### Phase 4: Document Workspace Integration (Week 4)
4.1 **Implement DocumentWorkspace Component**
   - Split-screen layout matching Stitch design (65% canvas, 35% context rail)
   - Academic page simulation with document header and metadata
   - Interactive PDF viewer with zoom and navigation controls

4.2 **Academic Content Display**
   - Page-aware document rendering with Stitch typography
   - OCR confidence indicators and grounding badges
   - Tutor marginalia integration with academic annotations

4.3 **Academic Header Implementation**
   - Document metadata display (title, date, topic, pages)
   - Academic badges and status indicators
   - Action cluster with study and tutor buttons

### Phase 5: OCR Verification UI (Week 5)
5.1 **Add Tabbed Interface**
   - "Annotated Scan" PDF viewer (Tab 1)
   - "OCR Inspector" verification view (Tab 2)
   - Real-time OCR confidence and metadata display

5.2 **Verification Features**
   - Side-by-side OCR comparison (raw text vs structured output)
   - Bounding box visualization and LaTeX parsing
   - Commit/correct OCR actions

5.3 **Academic Formatting**
   - Professional academic interface for OCR verification
   - Grounding indicators and citation integration
   - Page-aware metadata display

### Phase 6: Tutor Panel Integration (Week 6)
6.1 **Connect to Existing Tutor**
   - Integrate existing `TutorChat` component with Stitch styling
   - Contextual prompt suggestions and academic formatting
   - Grounded response display with citation badges

6.2 **AI Tutor Interface**
   - Academic companion interface with deep slate background
   - Source-grounded answer indicators and grounding badges
   - Contextual query suggestions for document pages

6.3 **Integration with Document Context**
   - Link tutor queries to specific document pages
   - Preserve existing tutor functionality and data flows
   - Academic formatting for tutor responses

### Phase 7: Study Session Integration (Week 7)
7.1 **Connect New UI to Existing Study Sessions**
   - Map Stitch study session presentation to existing session state
   - Preserve all Phase 5 functionality and backend API calls
   - Maintain existing study session lifecycle

7.2 **Study Session Presentation**
   - Academic study session interface with Stitch design
   - Progress tracking and mastery indicators
   - Session handoff and study progress continuity

### Phase 8: Library & Navigation Integration (Week 8)
8.1 **Apply Stitch Visual System Consistently**
   - Update library page with academic styling
   - Integrate study hub and topics pages
   - Maintain existing functionality while applying visual updates

8.2 **Responsive Library Implementation**
   - Document catalog view with academic card design
   - Upload interface with enhanced academic styling
   - Filter and search capabilities with Stitch UX

### Phase 9: Verification & Testing (Week 9)
9.1 **Comprehensive Testing**
   - Run existing test suite (`npm test`, `npm run typecheck`, `npm run lint`)
   - Visual verification of all major routes
   - Cross-browser and mobile testing

9.2 **Validation Checklist**
   - [ ] All existing Phase 5 functionality preserved
   - [ ] OCR pipeline continues working
   - [ ] AI tutor integration complete
   - [ ] Study session lifecycle intact
   - [ ] No breaking changes to existing API contracts
   - [ ] TypeScript and build validation passes
   - [ ] Visual design consistency across all routes

## Risk Mitigation & Constraints

### Phase 5 Priority
- Study session functionality has priority over visual similarity
- Backend behavior must not change to accommodate visual requirements
- No database schema modifications unless functionally required

### Data Integrity
- Use real Supabase/API data only (no mock data)
- Preserve existing OCR metadata and tutor data
- Maintain existing authentication and authorization

### Technical Constraints
- No unnecessary database migrations
- No API contract changes
- Preserve existing component architecture where appropriate
- Maintain existing performance characteristics

## Success Metrics

### Functional Requirements
- Existing Phase 1-5 functionality unchanged
- OCR pipeline continues working with real data
- AI tutor integration preserves grounding and citations
- Study session lifecycle maintained
- All routes and API endpoints function correctly

### UI/UX Requirements
- Stitch visual language clearly represented
- Responsive design implemented across all breakpoints
- Components are reusable and maintainable
- Navigation works across all sections
- Interactive controls function properly

### Engineering Requirements
- TypeScript validation passes
- All existing tests continue to pass
- Build process succeeds without errors
- No major console/runtime errors
- Type safety maintained

## Implementation Timeline

| Week | Focus | Deliverables |
|------|--------|-------------|
| 1 | Audit & Mapping | Component mapping, design token alignment |
| 2 | Design Tokens | Updated Tailwind config, token provider |
| 3 | Shared Shell | Enhanced StudyShell, responsive navigation |
| 4 | Document Workspace | Primary PDF/OCR interface implementation |
| 5 | OCR Verification | Tabbed OCR inspection interface |
| 6 | Tutor Panel | AI tutor integration with academic interface |
| 7 | Study Sessions | Connect new UI to existing session lifecycle |
| 8 | Library & Navigation | Apply visual system consistently |
| 9 | Verification | Testing, validation, final review |

## Final Acceptance Criteria

The integration is complete only when ALL of the following are true:

1. **Functionality**: All existing Phase 1-5 functionality continues working
2. **UI**: Stitch visual language is represented, responsive, and components are reusable
3. **Data**: Real Supabase/API data is used, no fake backend functionality
4. **Engineering**: TypeScript passes, tests pass, build passes, no major errors

## Final Reporting Requirements

### 1. Stitch Screens/Elements Implemented
List each Stitch visual element successfully integrated into the application.

### 2. Existing Components Reused
List all existing components that were reused during integration.

### 3. New Components Created
List all new components created with their specific purposes.

### 4. Routes Changed
List all routes modified during the integration process.

### 5. Backend/API Changes
State clearly: `None` if no changes were required.

### 6. Database Changes
State clearly: `None` if no database changes were required.

### 7. OCR Integration Impact
Explain exactly how the Stitch UI interacts with the existing OCR system.

### 8. Tests
Report exact commands used and test results.

### 9. Build
Report the exact build result.

### 10. Visual Verification
Report which routes were checked and any remaining visual issues.

### 11. Remaining Work
List any Stitch-designed elements that couldn't be implemented due to backend limitations.

**Important**: Do NOT hide limitations - report all unfulfilled Stitch design requirements.

## Final Rule

The existing AI Study Agent is the product. Stitch is the design reference.

Never sacrifice working functionality for visual similarity.

The final result should feel like the Stitch design was purpose-built for the existing AI Study Agent rather than a Stitch prototype pasted on top of it.