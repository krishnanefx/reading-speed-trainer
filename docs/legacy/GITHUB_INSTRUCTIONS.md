# Publishing to GitHub

I have initialized a local Git repository and committed all your code. 
To publish this to your GitHub account (`krishnanadaikkappan`), follow these steps:

1.  **Create a New Repo on GitHub**:
    *   Go to [github.com/new](https://github.com/new).
    *   Name it `speed-reader-trainer` (or whatever you prefer).
    *   **Do not** initialize with README, .gitignore, or License (we already have them).
    *   Click "Create repository".

2.  **Push your code**:
    Copy the commands under "…or push an existing repository from the command line" and run them in your terminal. They should look like this:

    ```bash
    git remote add origin https://github.com/YourUsername/reading-speed-trainer.git
    git branch -M main
    git push -u origin main
    ```

3.  **Deployment**:
    *   Once pushed, you can go to [Netlify](https://app.netlify.com) or [Vercel](https://vercel.com).
    *   "Import from Git".
    *   Select this repository.
    *   **Important**: Add your Environment Variables in the deployment dashboard!
        *   `VITE_SUPABASE_URL`: (Your URL)
        *   `VITE_SUPABASE_ANON_KEY`: (Your Key)
