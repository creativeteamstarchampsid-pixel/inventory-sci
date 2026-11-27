/**
 * StarOps Supabase database types — mirrors `supabase/schema.sql`.
 *
 * After applying `supabase/schema.sql` to your Supabase project, you can also
 * regenerate directly from the remote schema with:
 *   npx supabase gen types typescript --project-id <project-ref> --schema public > src/types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "OWNER" | "SUPER_ADMIN" | "TEAM_LEADER" | "STAFF";

export type CodeCategoryPrefix =
  | "SNS"
  | "MTR"
  | "WCR"
  | "ELK"
  | "FRN"
  | "ATK"
  | "HBP"
  | "DOC"
  | "SUB";

export type LocationGroup = "THERAPY" | "OFFICE" | "ARCHIVE" | "DIGITAL";

export type PresetLocationCode =
  | "R01"
  | "R02"
  | "R03"
  | "R04"
  | "R05"
  | "R06"
  | "ADM"
  | "FO"
  | "GDG"
  | "L01"
  | "L02"
  | "L03"
  | "L04"
  | "DIG";

export type LocationCode = string;

export type BarcodeFormat = "CODE128" | "QR" | "COMBO";
export type AssetType = "THERAPY_TOY" | "FIXED_ASSET" | "CONSUMABLE";
export type ItemCondition =
  | "BAIK"
  | "PART_KURANG"
  | "RUSAK_RINGAN"
  | "RUSAK_BERAT"
  | "DALAM_PERBAIKAN"
  | "DIHAPUSBUKU";
export type HygieneStatus = "STERIL" | "PERLU_DICUCI" | "SEDANG_DISANITASI";
export type KitStatus = "TERSEDIA" | "DIPINJAM" | "TIDAK_LENGKAP" | "NONAKTIF";
export type BorrowStatus = "DIPINJAM" | "DIKEMBALIKAN" | "TERLAMBAT" | "HILANG_PART";
export type BillingCycle = "BULANAN" | "TAHUNAN" | "SEKALI_BAYAR";
export type PaymentMethod =
  | "GOPAY"
  | "KARTU_DEBIT"
  | "KARTU_KREDIT"
  | "TRANSFER_BANK"
  | "VA"
  | "LAINNYA";
export type ArchivePhysicalStatus = "TERSEDIA_DI_LEMARI" | "DIPINJAM" | "ARSIP_LAMA";
export type DeliveryDirection = "INBOUND" | "OUTBOUND";
export type DeliveryStatus =
  | "DRAFT"
  | "DIKEMAS"
  | "DALAM_PERJALANAN"
  | "DITERIMA"
  | "SELESAI"
  | "DIBATALKAN";
export type RequestType =
  | "PENGADAAN_BARANG"
  | "LAPORAN_KERUSAKAN"
  | "PART_HILANG"
  | "AKSES_AKUN"
  | "PENGHAPUSAN_ASET";
export type RequestStatus =
  | "MENUNGGU_TEAM_LEADER"
  | "MENUNGGU_ADMIN"
  | "MENUNGGU_OWNER"
  | "DISETUJUI"
  | "DITOLAK"
  | "SELESAI";
export type BackupType = "PRE_UPDATE" | "MONTHLY_CUTOFF" | "MANUAL";
export type BarcodeAliasReason = "MERGED_DUPLICATE" | "LEGACY_BARCODE" | "SUB_ITEM_REDIRECT";
export type OpnameSessionStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED";
export type OpnameItemStatus =
  | "BELUM_DIPERIKSA"
  | "SEDANG_DIPERIKSA"
  | "MENUNGGU_PENYIMPANAN"
  | "SUDAH_DIPERIKSA";

export type Database = {
  public: {
    Tables: {
      locations_master: {
        Row: {
          code: string;
          name: string;
          location_group: LocationGroup;
          description: string | null;
          pic_name: string | null;
          include_in_opname: boolean;
          is_active: boolean;
          is_system: boolean;
          sort_order: number;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          name: string;
          location_group: LocationGroup;
          description?: string | null;
          pic_name?: string | null;
          include_in_opname?: boolean;
          is_active?: boolean;
          is_system?: boolean;
          sort_order?: number;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          name?: string;
          location_group?: LocationGroup;
          description?: string | null;
          pic_name?: string | null;
          include_in_opname?: boolean;
          is_active?: boolean;
          is_system?: boolean;
          sort_order?: number;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          role: UserRole;
          is_active: boolean;
          phone: string | null;
          job_title: string | null;
          offboarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          role?: UserRole;
          is_active?: boolean;
          phone?: string | null;
          job_title?: string | null;
          offboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          role?: UserRole;
          is_active?: boolean;
          phone?: string | null;
          job_title?: string | null;
          offboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      code_sequences: {
        Row: {
          scope_key: string;
          sub_key: string;
          last_seq: number;
          updated_at: string;
        };
        Insert: {
          scope_key: string;
          sub_key: string;
          last_seq?: number;
          updated_at?: string;
        };
        Update: {
          scope_key?: string;
          sub_key?: string;
          last_seq?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      items_master: {
        Row: {
          id: string;
          item_code: string;
          parent_item_id: string | null;
          has_sub_items: boolean;
          barcode_format: BarcodeFormat;
          name: string;
          description: string | null;
          category_prefix: CodeCategoryPrefix;
          category: string;
          asset_type: AssetType;
          room_code: LocationCode;
          rack_location: string | null;
          pic_name: string | null;
          photo_url: string | null;
          acquisition_date: string | null;
          purchase_price: number;
          useful_life_months: number | null;
          residual_value: number;
          total_parts: number;
          current_parts: number;
          unit_label: string;
          stock_qty: number;
          min_stock_threshold: number;
          condition: ItemCondition;
          hygiene_status: HygieneStatus;
          last_sanitized_at: string | null;
          next_sanitization_due: string | null;
          source_delivery_id: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          item_code?: string;
          parent_item_id?: string | null;
          has_sub_items?: boolean;
          barcode_format?: BarcodeFormat;
          name: string;
          description?: string | null;
          category_prefix: CodeCategoryPrefix;
          category: string;
          asset_type?: AssetType;
          room_code: LocationCode;
          rack_location?: string | null;
          pic_name?: string | null;
          photo_url?: string | null;
          acquisition_date?: string | null;
          purchase_price?: number;
          useful_life_months?: number | null;
          residual_value?: number;
          total_parts?: number;
          current_parts?: number;
          unit_label?: string;
          stock_qty?: number;
          min_stock_threshold?: number;
          condition?: ItemCondition;
          hygiene_status?: HygieneStatus;
          last_sanitized_at?: string | null;
          next_sanitization_due?: string | null;
          source_delivery_id?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          item_code?: string;
          parent_item_id?: string | null;
          has_sub_items?: boolean;
          barcode_format?: BarcodeFormat;
          name?: string;
          description?: string | null;
          category_prefix?: CodeCategoryPrefix;
          category?: string;
          asset_type?: AssetType;
          room_code?: LocationCode;
          rack_location?: string | null;
          pic_name?: string | null;
          photo_url?: string | null;
          acquisition_date?: string | null;
          purchase_price?: number;
          useful_life_months?: number | null;
          residual_value?: number;
          total_parts?: number;
          current_parts?: number;
          unit_label?: string;
          stock_qty?: number;
          min_stock_threshold?: number;
          condition?: ItemCondition;
          hygiene_status?: HygieneStatus;
          last_sanitized_at?: string | null;
          next_sanitization_due?: string | null;
          source_delivery_id?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      item_kits: {
        Row: {
          id: string;
          kit_code: string;
          kit_name: string;
          description: string | null;
          bundled_item_ids: string[];
          assigned_room: LocationCode | null;
          status: KitStatus;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kit_code?: string;
          kit_name: string;
          description?: string | null;
          bundled_item_ids?: string[];
          assigned_room?: LocationCode | null;
          status?: KitStatus;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kit_code?: string;
          kit_name?: string;
          description?: string | null;
          bundled_item_ids?: string[];
          assigned_room?: LocationCode | null;
          status?: KitStatus;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      borrow_transactions: {
        Row: {
          id: string;
          transaction_code: string;
          item_id: string | null;
          kit_id: string | null;
          borrower_id: string;
          room_code: LocationCode | null;
          parts_before: number | null;
          parts_after: number | null;
          status: BorrowStatus;
          borrowed_at: string;
          due_at: string | null;
          returned_at: string | null;
          returned_by: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          transaction_code?: string;
          item_id?: string | null;
          kit_id?: string | null;
          borrower_id: string;
          room_code?: LocationCode | null;
          parts_before?: number | null;
          parts_after?: number | null;
          status?: BorrowStatus;
          borrowed_at?: string;
          due_at?: string | null;
          returned_at?: string | null;
          returned_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          transaction_code?: string;
          item_id?: string | null;
          kit_id?: string | null;
          borrower_id?: string;
          room_code?: LocationCode | null;
          parts_before?: number | null;
          parts_after?: number | null;
          status?: BorrowStatus;
          borrowed_at?: string;
          due_at?: string | null;
          returned_at?: string | null;
          returned_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      subscriptions_vault: {
        Row: {
          id: string;
          sub_code: string;
          service_name: string;
          plan_name: string | null;
          login_email: string;
          password_encrypted: string;
          pin_recovery_encrypted: string | null;
          billing_cycle: BillingCycle;
          cost: number;
          currency: string;
          payment_method: PaymentMethod;
          payment_account_label: string | null;
          renewal_date: string | null;
          auto_renew: boolean;
          max_slots: number;
          assigned_users_json: Json;
          password_rotated_at: string;
          notes: string | null;
          is_active: boolean;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sub_code?: string;
          service_name: string;
          plan_name?: string | null;
          login_email: string;
          password_encrypted: string;
          pin_recovery_encrypted?: string | null;
          billing_cycle?: BillingCycle;
          cost?: number;
          currency?: string;
          payment_method?: PaymentMethod;
          payment_account_label?: string | null;
          renewal_date?: string | null;
          auto_renew?: boolean;
          max_slots?: number;
          assigned_users_json?: Json;
          password_rotated_at?: string;
          notes?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sub_code?: string;
          service_name?: string;
          plan_name?: string | null;
          login_email?: string;
          password_encrypted?: string;
          pin_recovery_encrypted?: string | null;
          billing_cycle?: BillingCycle;
          cost?: number;
          currency?: string;
          payment_method?: PaymentMethod;
          payment_account_label?: string | null;
          renewal_date?: string | null;
          auto_renew?: boolean;
          max_slots?: number;
          assigned_users_json?: Json;
          password_rotated_at?: string;
          notes?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      archives_hybrid: {
        Row: {
          id: string;
          doc_code: string;
          title: string;
          category: string;
          branch_building: string;
          cabinet_code: LocationCode;
          drawer_no: string;
          folder_code: string | null;
          physical_status: ArchivePhysicalStatus;
          borrowed_by: string | null;
          digital_file_url: string | null;
          digital_file_name: string | null;
          drive_link: string | null;
          version_no: number;
          is_sop_public_to_staff: boolean;
          notes: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doc_code?: string;
          title: string;
          category: string;
          branch_building?: string;
          cabinet_code: LocationCode;
          drawer_no: string;
          folder_code?: string | null;
          physical_status?: ArchivePhysicalStatus;
          borrowed_by?: string | null;
          digital_file_url?: string | null;
          digital_file_name?: string | null;
          drive_link?: string | null;
          version_no?: number;
          is_sop_public_to_staff?: boolean;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doc_code?: string;
          title?: string;
          category?: string;
          branch_building?: string;
          cabinet_code?: LocationCode;
          drawer_no?: string;
          folder_code?: string | null;
          physical_status?: ArchivePhysicalStatus;
          borrowed_by?: string | null;
          digital_file_url?: string | null;
          digital_file_name?: string | null;
          drive_link?: string | null;
          version_no?: number;
          is_sop_public_to_staff?: boolean;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      archive_versions: {
        Row: {
          id: string;
          archive_id: string;
          version_no: number;
          digital_file_url: string | null;
          digital_file_name: string | null;
          drive_link: string | null;
          change_notes: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          archive_id: string;
          version_no: number;
          digital_file_url?: string | null;
          digital_file_name?: string | null;
          drive_link?: string | null;
          change_notes?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          archive_id?: string;
          version_no?: number;
          digital_file_url?: string | null;
          digital_file_name?: string | null;
          drive_link?: string | null;
          change_notes?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      deliveries_log: {
        Row: {
          id: string;
          delivery_code: string;
          direction: DeliveryDirection;
          package_type: string;
          courier_name: string;
          tracking_number: string | null;
          shipping_cost: number;
          sender_name: string;
          sender_address: string | null;
          receiver_name: string;
          receiver_address: string | null;
          pic_name: string | null;
          is_fragile: boolean;
          items_payload_json: Json;
          proof_photo_url: string | null;
          status: DeliveryStatus;
          converted_to_stock_at: string | null;
          shipped_at: string | null;
          received_at: string | null;
          notes: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          delivery_code?: string;
          direction: DeliveryDirection;
          package_type: string;
          courier_name: string;
          tracking_number?: string | null;
          shipping_cost?: number;
          sender_name: string;
          sender_address?: string | null;
          receiver_name: string;
          receiver_address?: string | null;
          pic_name?: string | null;
          is_fragile?: boolean;
          items_payload_json?: Json;
          proof_photo_url?: string | null;
          status?: DeliveryStatus;
          converted_to_stock_at?: string | null;
          shipped_at?: string | null;
          received_at?: string | null;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          delivery_code?: string;
          direction?: DeliveryDirection;
          package_type?: string;
          courier_name?: string;
          tracking_number?: string | null;
          shipping_cost?: number;
          sender_name?: string;
          sender_address?: string | null;
          receiver_name?: string;
          receiver_address?: string | null;
          pic_name?: string | null;
          is_fragile?: boolean;
          items_payload_json?: Json;
          proof_photo_url?: string | null;
          status?: DeliveryStatus;
          converted_to_stock_at?: string | null;
          shipped_at?: string | null;
          received_at?: string | null;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_backups: {
        Row: {
          id: string;
          backup_code: string;
          backup_type: BackupType;
          period_ym: string;
          snapshot_json_url: string | null;
          export_xlsx_url: string | null;
          export_csv_url: string | null;
          export_pdf_url: string | null;
          diff_summary_json: Json;
          row_counts_json: Json;
          notes: string | null;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          backup_code: string;
          backup_type: BackupType;
          period_ym: string;
          snapshot_json_url?: string | null;
          export_xlsx_url?: string | null;
          export_csv_url?: string | null;
          export_pdf_url?: string | null;
          diff_summary_json?: Json;
          row_counts_json?: Json;
          notes?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          backup_code?: string;
          backup_type?: BackupType;
          period_ym?: string;
          snapshot_json_url?: string | null;
          export_xlsx_url?: string | null;
          export_csv_url?: string | null;
          export_pdf_url?: string | null;
          diff_summary_json?: Json;
          row_counts_json?: Json;
          notes?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      monthly_reconciliations: {
        Row: {
          id: string;
          period_ym: string;
          opname_progress_pct: number;
          opname_checklist_json: Json;
          pre_update_backup_id: string | null;
          final_backup_id: string | null;
          verified_by_admin: string | null;
          verified_by_admin_at: string | null;
          approved_by_leader: string | null;
          approved_by_leader_at: string | null;
          approved_by_owner: string | null;
          approved_by_owner_at: string | null;
          locked_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          period_ym: string;
          opname_progress_pct?: number;
          opname_checklist_json?: Json;
          pre_update_backup_id?: string | null;
          final_backup_id?: string | null;
          verified_by_admin?: string | null;
          verified_by_admin_at?: string | null;
          approved_by_leader?: string | null;
          approved_by_leader_at?: string | null;
          approved_by_owner?: string | null;
          approved_by_owner_at?: string | null;
          locked_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          period_ym?: string;
          opname_progress_pct?: number;
          opname_checklist_json?: Json;
          pre_update_backup_id?: string | null;
          final_backup_id?: string | null;
          verified_by_admin?: string | null;
          verified_by_admin_at?: string | null;
          approved_by_leader?: string | null;
          approved_by_leader_at?: string | null;
          approved_by_owner?: string | null;
          approved_by_owner_at?: string | null;
          locked_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      internal_requests: {
        Row: {
          id: string;
          request_code: string;
          request_type: RequestType;
          title: string;
          description: string;
          related_item_id: string | null;
          related_sub_id: string | null;
          estimated_cost: number | null;
          status: RequestStatus;
          requested_by: string;
          team_leader_approved_by: string | null;
          team_leader_approved_at: string | null;
          admin_verified_by: string | null;
          admin_verified_at: string | null;
          owner_approved_by: string | null;
          owner_approved_at: string | null;
          rejection_reason: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          request_code?: string;
          request_type: RequestType;
          title: string;
          description: string;
          related_item_id?: string | null;
          related_sub_id?: string | null;
          estimated_cost?: number | null;
          status?: RequestStatus;
          requested_by?: string;
          team_leader_approved_by?: string | null;
          team_leader_approved_at?: string | null;
          admin_verified_by?: string | null;
          admin_verified_at?: string | null;
          owner_approved_by?: string | null;
          owner_approved_at?: string | null;
          rejection_reason?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          request_code?: string;
          request_type?: RequestType;
          title?: string;
          description?: string;
          related_item_id?: string | null;
          related_sub_id?: string | null;
          estimated_cost?: number | null;
          status?: RequestStatus;
          requested_by?: string;
          team_leader_approved_by?: string | null;
          team_leader_approved_at?: string | null;
          admin_verified_by?: string | null;
          admin_verified_at?: string | null;
          owner_approved_by?: string | null;
          owner_approved_at?: string | null;
          rejection_reason?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          actor_name: string | null;
          actor_role: UserRole | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          entity_code: string | null;
          summary: string;
          old_data: Json | null;
          new_data: Json | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          actor_role?: UserRole | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          entity_code?: string | null;
          summary: string;
          old_data?: Json | null;
          new_data?: Json | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      system_telemetry_daily: {
        Row: {
          metric_date: string;
          db_size_bytes: number;
          storage_size_bytes: number;
          db_egress_bytes: number;
          storage_egress_bytes: number;
          export_egress_bytes: number;
          pg_tuples_snapshot: number;
          query_count: number;
          updated_at: string;
        };
        Insert: {
          metric_date: string;
          db_size_bytes?: number;
          storage_size_bytes?: number;
          db_egress_bytes?: number;
          storage_egress_bytes?: number;
          export_egress_bytes?: number;
          pg_tuples_snapshot?: number;
          query_count?: number;
          updated_at?: string;
        };
        Update: {
          metric_date?: string;
          db_size_bytes?: number;
          storage_size_bytes?: number;
          db_egress_bytes?: number;
          storage_egress_bytes?: number;
          export_egress_bytes?: number;
          pg_tuples_snapshot?: number;
          query_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      share_short_links: {
        Row: {
          id: string;
          slug: string;
          target_type: "ITEM" | "ARCHIVE";
          target_id: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          target_type: "ITEM" | "ARCHIVE";
          target_id: string;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          target_type?: "ITEM" | "ARCHIVE";
          target_id?: string;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "share_short_links_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "share_short_links_updated_by_fkey";
            columns: ["updated_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_share_links: {
        Row: {
          id: string;
          slug: string;
          delivery_id: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          delivery_id: string;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          delivery_id?: string;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_share_links_delivery_id_fkey";
            columns: ["delivery_id"];
            referencedRelation: "deliveries_log";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_share_links_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_share_links_updated_by_fkey";
            columns: ["updated_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      barcode_label_presets: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_default: boolean;
          config_json: Json;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_default?: boolean;
          config_json: Json;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_default?: boolean;
          config_json?: Json;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "barcode_label_presets_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "barcode_label_presets_updated_by_fkey";
            columns: ["updated_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      item_barcode_aliases: {
        Row: {
          id: string;
          alias_code: string;
          target_item_id: string;
          legacy_item_id: string | null;
          legacy_name: string | null;
          alias_reason: BarcodeAliasReason;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          alias_code: string;
          target_item_id: string;
          legacy_item_id?: string | null;
          legacy_name?: string | null;
          alias_reason?: BarcodeAliasReason;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          alias_code?: string;
          target_item_id?: string;
          legacy_item_id?: string | null;
          legacy_name?: string | null;
          alias_reason?: BarcodeAliasReason;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_barcode_aliases_target_item_id_fkey";
            columns: ["target_item_id"];
            referencedRelation: "items_master";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_barcode_aliases_legacy_item_id_fkey";
            columns: ["legacy_item_id"];
            referencedRelation: "items_master";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_opname_sessions: {
        Row: {
          id: string;
          session_code: string;
          period_ym: string;
          room_code: LocationCode | null;
          title: string;
          status: OpnameSessionStatus;
          notes: string | null;
          created_by: string | null;
          completed_by: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_code?: string;
          period_ym: string;
          room_code?: LocationCode | null;
          title: string;
          status?: OpnameSessionStatus;
          notes?: string | null;
          created_by?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_code?: string;
          period_ym?: string;
          room_code?: LocationCode | null;
          title?: string;
          status?: OpnameSessionStatus;
          notes?: string | null;
          created_by?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_opname_items: {
        Row: {
          id: string;
          session_id: string;
          item_id: string;
          parent_item_id: string | null;
          status: OpnameItemStatus;
          system_stock: number;
          actual_stock: number | null;
          stock_diff: number | null;
          system_parts: number;
          actual_parts: number | null;
          condition: ItemCondition | null;
          hygiene_status: HygieneStatus | null;
          notes: string | null;
          checked_by: string | null;
          checked_at: string | null;
          saved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          item_id: string;
          parent_item_id?: string | null;
          status?: OpnameItemStatus;
          system_stock: number;
          actual_stock?: number | null;
          system_parts?: number;
          actual_parts?: number | null;
          condition?: ItemCondition | null;
          hygiene_status?: HygieneStatus | null;
          notes?: string | null;
          checked_by?: string | null;
          checked_at?: string | null;
          saved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          item_id?: string;
          parent_item_id?: string | null;
          status?: OpnameItemStatus;
          system_stock?: number;
          actual_stock?: number | null;
          system_parts?: number;
          actual_parts?: number | null;
          condition?: ItemCondition | null;
          hygiene_status?: HygieneStatus | null;
          notes?: string | null;
          checked_by?: string | null;
          checked_at?: string | null;
          saved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_opname_items_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "stock_opname_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_opname_items_item_id_fkey";
            columns: ["item_id"];
            referencedRelation: "items_master";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_opname_items_parent_item_id_fkey";
            columns: ["parent_item_id"];
            referencedRelation: "items_master";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      subscriptions_vault_directory: {
        Row: {
          id: string;
          sub_code: string;
          service_name: string;
          plan_name: string | null;
          login_email: string;
          billing_cycle: BillingCycle;
          cost: number | null;
          currency: string | null;
          payment_method: PaymentMethod | null;
          payment_account_label: string | null;
          renewal_date: string | null;
          auto_renew: boolean;
          max_slots: number;
          assigned_users_json: Json;
          password_rotated_at: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: UserRole;
      };
      has_role: {
        Args: { roles: UserRole[] };
        Returns: boolean;
      };
      is_active_user: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      generate_item_code: {
        Args: { p_category: string; p_location: string; p_parent_code?: string | null };
        Returns: string;
      };
      encrypt_vault_secret: {
        Args: { p_plaintext: string; p_encryption_key: string };
        Returns: string;
      };
      reveal_subscription_secret: {
        Args: { p_sub_id: string; p_encryption_key: string };
        Returns: { password_plain: string; pin_recovery_plain: string | null }[];
      };
      purge_expired_recycle_bin: {
        Args: { p_days?: number };
        Returns: Json;
      };
      record_egress_telemetry: {
        Args: {
          p_db_bytes?: number;
          p_storage_bytes?: number;
          p_export_bytes?: number;
          p_queries?: number;
        };
        Returns: undefined;
      };
      get_admin_infrastructure_metrics: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      submit_stock_opname_batch: {
        Args: {
          p_session_id: string;
          p_entries: Json;
          p_parent_item_id?: string | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      user_role: UserRole;
      code_category_prefix: CodeCategoryPrefix;
      location_code: LocationCode;
      barcode_format: BarcodeFormat;
      asset_type: AssetType;
      item_condition: ItemCondition;
      hygiene_status: HygieneStatus;
      kit_status: KitStatus;
      borrow_status: BorrowStatus;
      billing_cycle: BillingCycle;
      payment_method: PaymentMethod;
      archive_physical_status: ArchivePhysicalStatus;
      delivery_direction: DeliveryDirection;
      delivery_status: DeliveryStatus;
      request_type: RequestType;
      request_status: RequestStatus;
      backup_type: BackupType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> =
  PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type Profile = Tables<"profiles">;
export type LocationMaster = Tables<"locations_master">;
export type ItemMaster = Tables<"items_master">;
export type ItemKit = Tables<"item_kits">;
export type BorrowTransaction = Tables<"borrow_transactions">;
export type SubscriptionVault = Tables<"subscriptions_vault">;
export type SubscriptionDirectoryRow = Views<"subscriptions_vault_directory">;
export type ArchiveHybrid = Tables<"archives_hybrid">;
export type ArchiveVersion = Tables<"archive_versions">;
export type DeliveryLog = Tables<"deliveries_log">;
export type SystemBackup = Tables<"system_backups">;
export type MonthlyReconciliation = Tables<"monthly_reconciliations">;
export type InternalRequest = Tables<"internal_requests">;
export type AuditLog = Tables<"audit_logs">;
export type ShareShortLink = Tables<"share_short_links">;
export type DeliveryShareLink = Tables<"delivery_share_links">;
export type BarcodeLabelPreset = Tables<"barcode_label_presets">;
export type ItemBarcodeAlias = Tables<"item_barcode_aliases">;
export type StockOpnameSession = Tables<"stock_opname_sessions">;
export type StockOpnameItem = Tables<"stock_opname_items">;
