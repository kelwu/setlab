export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string | null
          spotify_id: string | null
          spotify_access_token: string | null
          spotify_refresh_token: string | null
          spotify_wishlist_playlist_id: string | null
          created_at: string
          subscription_tier: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'subscription_tier'> & { id?: string; created_at?: string; subscription_tier?: string }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      serato_libraries: {
        Row: {
          id: string
          user_id: string
          total_tracks: number
          last_synced: string | null
          is_public: boolean
        }
        Insert: Omit<Database['public']['Tables']['serato_libraries']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['serato_libraries']['Insert']>
      }
      serato_tracks: {
        Row: {
          id: string
          library_id: string
          file_path: string | null
          artist: string | null
          title: string | null
          bpm: number | null
          key: string | null
          duration: number | null
          genre: string | null
          year: number | null
          date_added: string | null
          play_count: number
          in_library: boolean
          lastfm_tags: string[] | null
        }
        Insert: Omit<Database['public']['Tables']['serato_tracks']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['serato_tracks']['Insert']>
      }
      serato_crates: {
        Row: {
          id: string
          library_id: string
          crate_name: string | null
          track_count: number
          track_ids: string[] | null
        }
        Insert: Omit<Database['public']['Tables']['serato_crates']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['serato_crates']['Insert']>
      }
      wishlist_tracks: {
        Row: {
          id: string
          user_id: string
          spotify_id: string | null
          artist: string | null
          title: string | null
          bpm: number | null
          key: string | null
          energy: number | null
          danceability: number | null
          valence: number | null
          loudness: number | null
          instrumentalness: number | null
          acousticness: number | null
          genre: string | null
          spotify_url: string | null
          beatport_search_url: string | null
          bpm_supreme_search_url: string | null
          traxsource_search_url: string | null
          status: 'wishlist' | 'downloaded' | 'in_library'
          added_at: string
          enrichment_source: 'pending' | 'beatport' | 'serato' | 'manual' | 'lastfm' | 'spotify'
          lastfm_tags: Json
          beatport_bpm: number | null
          beatport_key: string | null
          beatport_url: string | null
          djcity_search_url: string | null
        }
        Insert: Omit<Database['public']['Tables']['wishlist_tracks']['Row'], 'id' | 'added_at'> & { id?: string; added_at?: string }
        Update: Partial<Database['public']['Tables']['wishlist_tracks']['Insert']>
      }
      setlists: {
        Row: {
          id: string
          user_id: string
          name: string
          primary_genre: string | null
          secondary_genre: string | null
          vibe: string | null
          crowd_context: 'club' | 'lounge' | 'wedding' | 'festival' | 'house-party' | 'radio' | 'corporate' | null
          duration_minutes: 30 | 60 | 90 | 120 | 180 | null
          energy_arc: Json | null
          lineup_slot: 'opener' | 'middle' | 'headliner' | 'closing' | null
          wordplay_theme: string | null
          is_public: boolean
          share_url: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['setlists']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['setlists']['Insert']>
      }
      gig_history: {
        Row: {
          id: string
          user_id: string
          gig_name: string | null
          gig_date: string | null
          venue: string | null
          setlist_id: string | null
          played_at: string
          actual_tracks: Json | null
          reflection_json: Json | null
        }
        Insert: Omit<Database['public']['Tables']['gig_history']['Row'], 'id' | 'played_at'> & { id?: string; played_at?: string }
        Update: Partial<Database['public']['Tables']['gig_history']['Insert']>
      }
      setlist_tracks: {
        Row: {
          id: string
          setlist_id: string
          serato_track_id: string | null
          wishlist_track_id: string | null
          position: number
          transition_notes: string | null
          harmonic_mixing_notes: string | null
          wordplay_connection: string | null
          why_this_track: string | null
          is_wishlist_track: boolean
          energy_level: number | null
        }
        Insert: Omit<Database['public']['Tables']['setlist_tracks']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['setlist_tracks']['Insert']>
      }
    }
  }
}
