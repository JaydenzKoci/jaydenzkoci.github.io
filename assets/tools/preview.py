import tkinter as tk
from tkinter import ttk, font, filedialog
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import requests
from PIL import Image, ImageTk
import io
import webbrowser
import json
import os

class SpotifyApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Spotify Preview Finder")
        self.geometry("580x720")
        self.resizable(False, False)
        
        self.configure(bg="#121212")
        style = ttk.Style(self)
        style.theme_use('clam')
        
        style.configure("TFrame", background="#121212")
        style.configure("TLabel", background="#121212", foreground="white", font=('Inter', 10))
        style.configure("Header.TLabel", font=('Inter', 18, 'bold'))
        style.configure("Info.TLabel", justify="left")
        style.configure("TButton", background="#1DB954", foreground="white", font=('Inter', 10, 'bold'), borderwidth=0)
        style.map("TButton", background=[('active', '#1ED760')])
        style.configure("TRadiobutton", background="#121212", foreground="white", font=('Inter', 10))
        style.map("TRadiobutton", background=[('active', '#333333')])
        
        self.default_font = font.nametofont("TkDefaultFont")
        self.default_font.configure(family="Inter", size=10)

        self.search_mode = tk.StringVar(value="name")
        self.preview_url = None
        self.spotify_client = None

        self.create_widgets()
        self.load_credentials()

    def create_widgets(self):
        main_frame = ttk.Frame(self, padding="20")
        main_frame.pack(expand=True, fill="both")

        cred_frame = ttk.Frame(main_frame, padding=10, relief="groove")
        cred_frame.pack(fill="x", pady=10)
        ttk.Label(cred_frame, text="Spotify API Credentials").pack()
        self.client_id_entry = self.create_entry(cred_frame, "Client ID")
        self.client_secret_entry = self.create_entry(cred_frame, "Client Secret", show="*")

        mode_frame = ttk.Frame(main_frame)
        mode_frame.pack(pady=10)
        ttk.Radiobutton(mode_frame, text="Search by Name", variable=self.search_mode, value="name", command=self.toggle_search_mode).pack(side="left", padx=10)
        ttk.Radiobutton(mode_frame, text="Search by Link", variable=self.search_mode, value="link", command=self.toggle_search_mode).pack(side="left", padx=10)

        input_container = ttk.Frame(main_frame)
        input_container.pack(fill="x", pady=5)

        self.name_frame = ttk.Frame(input_container)
        self.track_entry = self.create_entry(self.name_frame, "Song Title")
        self.artist_entry = self.create_entry(self.name_frame, "Artist Name")
        
        self.link_frame = ttk.Frame(input_container)
        self.link_entry = self.create_entry(self.link_frame, "Spotify Track URL")

        self.name_frame.pack(fill="x") 

        search_button = ttk.Button(main_frame, text="Search", command=self.search_track)
        search_button.pack(pady=20, fill="x", ipady=5)

        self.results_frame = ttk.Frame(main_frame)
        self.results_frame.pack(pady=10, anchor="w")
        
        self.album_art_label = tk.Label(self.results_frame, bg="#333333", width=300, height=300)
        self.album_art_label.pack(side="left", padx=(0, 20))

        info_frame = ttk.Frame(self.results_frame)
        info_frame.pack(side="left", fill="x", expand=True, anchor="nw")

        self.track_name_label = ttk.Label(info_frame, text="", style="Info.TLabel", font=('Inter', 14, 'bold'), wraplength=220)
        self.track_name_label.pack(anchor="w", pady=(0, 5))

        self.artist_name_label = ttk.Label(info_frame, text="", style="Info.TLabel", font=('Inter', 11), wraplength=220)
        self.artist_name_label.pack(anchor="w", pady=5)
        
        self.album_name_label = ttk.Label(info_frame, text="", style="Info.TLabel", wraplength=220)
        self.album_name_label.pack(anchor="w", pady=5)

        self.release_date_label = ttk.Label(info_frame, text="", style="Info.TLabel", wraplength=220)
        self.release_date_label.pack(anchor="w", pady=5)

        self.duration_label = ttk.Label(info_frame, text="", style="Info.TLabel", wraplength=220)
        self.duration_label.pack(anchor="w", pady=5)

        self.play_button = ttk.Button(info_frame, text="Play 30s Preview", state="disabled", command=self.play_preview)
        self.play_button.pack(pady=(20, 5), fill="x", ipady=5)
        
        self.download_button = ttk.Button(info_frame, text="Download Preview", state="disabled", command=self.download_preview)
        self.download_button.pack(pady=5, fill="x", ipady=5)
        
        self.status_label = ttk.Label(main_frame, text="", foreground="orange")
        self.status_label.pack(pady=10)

    def create_entry(self, parent, placeholder, show=None):
        entry = tk.Entry(parent, bg="#333333", fg="white", insertbackground="white", relief="flat", show=show)
        entry.pack(pady=5, fill="x", ipady=8, padx=5)
        entry.insert(0, placeholder)
        entry.bind("<FocusIn>", lambda e: self.on_focus_in(e, placeholder))
        entry.bind("<FocusOut>", lambda e: self.on_focus_out(e, placeholder))
        return entry

    def on_focus_in(self, event, placeholder):
        if event.widget.get() == placeholder:
            event.widget.delete(0, "end")

    def on_focus_out(self, event, placeholder):
        if not event.widget.get():
            event.widget.insert(0, placeholder)

    def toggle_search_mode(self):
        if self.search_mode.get() == "name":
            self.link_frame.pack_forget()
            self.name_frame.pack(fill="x")
        else:
            self.name_frame.pack_forget()
            self.link_frame.pack(fill="x")

    def load_credentials(self):
        if os.path.exists("config.json"):
            try:
                with open("config.json", "r") as f:
                    creds = json.load(f)
                    if creds.get("client_id") and creds.get("client_secret"):
                        self.client_id_entry.delete(0, "end")
                        self.client_id_entry.insert(0, creds["client_id"])
                        self.client_secret_entry.delete(0, "end")
                        self.client_secret_entry.insert(0, creds["client_secret"])
            except (json.JSONDecodeError, IOError):
                self.update_status("Could not load credentials from config.json", "orange")

    def save_credentials(self, client_id, client_secret):
        creds = {"client_id": client_id, "client_secret": client_secret}
        try:
            with open("config.json", "w") as f:
                json.dump(creds, f)
        except IOError:
            self.update_status("Warning: Could not save credentials.", "orange")

    def authenticate_spotify(self):
        client_id = self.client_id_entry.get()
        client_secret = self.client_secret_entry.get()

        if client_id == "Client ID" or client_secret == "Client Secret":
            self.update_status("Error: Please enter your Client ID and Secret.", "red")
            return False
            
        try:
            auth_manager = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
            self.spotify_client = spotipy.Spotify(auth_manager=auth_manager)
            self.spotify_client.search(q='a', type='track', limit=1) 
            self.save_credentials(client_id, client_secret)
            return True
        except Exception as e:
            self.update_status(f"Authentication Failed. Check credentials.", "red")
            return False

    def search_track(self):
        self.clear_results()
        if not self.authenticate_spotify():
            return
            
        self.update_status("Searching...", "white")
        
        try:
            track = None
            if self.search_mode.get() == "name":
                track_name = self.track_entry.get()
                artist_name = self.artist_entry.get()
                if track_name == "Song Title" or artist_name == "Artist Name":
                    self.update_status("Error: Please enter song and artist.", "red")
                    return
                results = self.spotify_client.search(q=f"track:{track_name} artist:{artist_name}", type="track", limit=1)
                if results['tracks']['items']:
                    track = results['tracks']['items'][0]
            else:
                link = self.link_entry.get()
                if "open.spotify.com/track/" not in link:
                     self.update_status("Error: Invalid Spotify track link.", "red")
                     return
                track_id = link.split('/')[-1].split('?')[0]
                track = self.spotify_client.track(track_id)
            
            if track:
                self.display_results(track)
            else:
                self.update_status("Track not found.", "orange")

        except Exception as e:
            self.update_status(f"An error occurred: {e}", "red")

    def display_results(self, track):
        track_name = track['name']
        artists = ", ".join([artist['name'] for artist in track['artists']])
        album_name = track['album']['name']
        release_date = track['album']['release_date']
        duration_ms = track['duration_ms']
        minutes, seconds = divmod(duration_ms / 1000, 60)
        duration_formatted = f"{int(minutes):02d}:{int(seconds):02d}"

        self.track_name_label.config(text=track_name)
        self.artist_name_label.config(text=artists)
        self.album_name_label.config(text=f"Album: {album_name}")
        self.release_date_label.config(text=f"Released: {release_date}")
        self.duration_label.config(text=f"Duration: {duration_formatted}")

        image_url = track['album']['images'][1]['url'] 
        response = requests.get(image_url)
        img_data = Image.open(io.BytesIO(response.content))
        
        self.album_art_image = ImageTk.PhotoImage(img_data)
        self.album_art_label.config(image=self.album_art_image)
        
        self.preview_url = track.get('preview_url')
        if self.preview_url:
            self.play_button.config(state="normal")
            self.download_button.config(state="normal")
            self.update_status("Preview found!", "#1DB954")
        else:
            self.update_status("Song found, but no preview available.", "orange")

    def play_preview(self):
        if self.preview_url:
            webbrowser.open(self.preview_url)

    def download_preview(self):
        if not self.preview_url:
            return

        try:
            track_name = self.track_name_label.cget("text")
            artist_name = self.artist_name_label.cget("text")
            safe_track_name = "".join(c for c in track_name if c.isalnum() or c in (' ',)).rstrip()
            safe_artist_name = "".join(c for c in artist_name if c.isalnum() or c in (' ',)).rstrip()
            
            default_filename = f"{safe_artist_name} - {safe_track_name} (Preview).mp3"

            filepath = filedialog.asksaveasfilename(
                defaultextension=".mp3",
                filetypes=[("MP3 Audio File", "*.mp3")],
                initialfile=default_filename,
                title="Save Preview As..."
            )

            if not filepath: 
                return

            self.update_status("Downloading...", "white")
            self.update() 

            response = requests.get(self.preview_url, stream=True)
            response.raise_for_status() 

            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            self.update_status("Download complete!", "#1DB954")

        except requests.exceptions.RequestException as e:
            self.update_status(f"Download failed: {e}", "red")
        except Exception as e:
            self.update_status(f"An error occurred while saving: {e}", "red")
            
    def update_status(self, message, color):
        self.status_label.config(text=message, foreground=color)
        
    def clear_results(self):
        self.track_name_label.config(text="")
        self.artist_name_label.config(text="")
        self.album_name_label.config(text="")
        self.release_date_label.config(text="")
        self.duration_label.config(text="")
        self.album_art_label.config(image='')
        self.play_button.config(state="disabled")
        self.download_button.config(state="disabled")
        self.preview_url = None


if __name__ == "__main__":
    app = SpotifyApp()
    app.mainloop()

