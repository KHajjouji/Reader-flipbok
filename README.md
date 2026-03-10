# Integration Guide: Story Module for Darija Word Wizard

This guide explains how to integrate the interactive Audiobook/Story Reader module into the [Darija Word Wizard](https://github.com/KHajjouji/darija-word-wizard.git) repository.

## Features Included
- **Multi-Language Support**: English, French, and Darija (Moroccan Arabic).
- **Responsive Text Overlays**: Text scales perfectly with the book size using container queries (`@container` and `cqw`).
- **3D Book Flip Animation**: Realistic page-turning effects using Framer Motion.
- **Admin Editor**: Built-in tools to drag-and-drop text over images, upload illustrations, and edit translations.
- **Audio Sync**: Text-to-Speech (TTS) and Audio File playback with synchronized word highlighting.

---

## Step 1: Install Dependencies

The Story Module relies on two main libraries for animations and icons. Run this command in your `darija-word-wizard` project root:

```bash
npm install motion lucide-react
```
*(Note: `motion` is the modern package name for Framer Motion).*

---

## Step 2: Copy the Component

1. In your `darija-word-wizard` project, navigate to your components directory (e.g., `src/components/` or `components/`).
2. Create a new file named `StoryModule.tsx`.
3. Copy the entire contents of the `src/components/StoryModule.tsx` file from this environment and paste it into your new file.

---

## Step 3: Integrate into your Pages/Routing

You can now use the `<StoryModule />` component anywhere in your app. For example, if you have a page for reading stories (e.g., `app/story/[id]/page.tsx` in Next.js or a route in React Router):

```tsx
import React from 'react';
import StoryModule from '@/components/StoryModule'; // Adjust path as needed

export default function StoryPage() {
  // Optional: You can pass a custom book object to the module.
  // If you don't pass anything, it uses the default "Little Explorer" Darija story.
  
  const handleSave = (updatedBook) => {
    console.log("Save this to your database:", updatedBook);
    // e.g., await api.saveStory(updatedBook);
  };

  return (
    <div className="w-full min-h-screen">
      <StoryModule onSave={handleSave} />
    </div>
  );
}
```

---

## Step 4: Tailwind CSS Configuration

The component uses Tailwind's `@container` queries for responsive text scaling (so text stays perfectly positioned over images regardless of screen size). 

If you are using Tailwind CSS v4 (which is the default in modern Vite/Next setups), container queries are built-in. 
If you are using Tailwind CSS v3, ensure you have the container queries plugin installed:

```bash
npm install @tailwindcss/container-queries
```
And add it to your `tailwind.config.js`:
```javascript
module.exports = {
  // ...
  plugins: [
    require('@tailwindcss/container-queries'),
  ],
}
```

---

## How to Customize

### 1. Changing Default Languages
Inside `StoryModule.tsx`, locate the `INITIAL_BOOK` constant. You can modify the `languages` array to match your app's exact language codes:
```typescript
languages: [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ary', label: 'Darija (Moroccan)' } // Or 'ar' for standard Arabic
]
```

### 2. Loading Dynamic Stories
Instead of relying on `INITIAL_BOOK`, fetch your story data from your backend (Supabase, Firebase, etc.) and pass it as a prop:
```tsx
<StoryModule initialBook={myFetchedBookData} />
```

### 3. Audio Files
The module supports both TTS and external audio files. When using audio files, ensure the URLs you provide in the Admin panel are publicly accessible (or accessible via your app's authentication).
