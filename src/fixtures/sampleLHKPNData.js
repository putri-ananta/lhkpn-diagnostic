/**
 * Realistic Sample LHKPN Data Fixtures for instant testing & demonstration
 */

export const SAMPLE_LHKPN_LIST = [
  {
    fileName: 'LHKPN_2024_Ahmad_Pratama.pdf',
    isParsedSuccess: true,
    status: 'Selesai',
    identity: {
      nama: 'Ahmad Pratama, S.E., M.Si.',
      jabatan: 'Direktur Jenderal Kekayaan Negara',
      nhk: 'NHK-1049281',
      bidang: 'Eksekutif',
      lembaga: 'Kementerian Keuangan RI',
      unit_kerja: 'Direktorat Jenderal Kekayaan Negara',
      tanggal_penyampaian: '15 Maret 2024',
      jenis_laporan: 'Laporan Periodik',
      tahun_laporan: '2023',
      status_verifikasi: 'Terverifikasi Lengkap'
    },
    assets: {
      tanah_dan_bangunan: 8645951000,
      alat_transportasi_dan_mesin: 400000000,
      harta_bergerak_lainnya: 260000000,
      surat_berharga: 0,
      kas_dan_setara_kas: 8290695027,
      harta_lainnya: 0,
      subtotal_harta: 17596646027,
      hutang: 0,
      total_harta_kekayaan: 17596646027
    },
    itemized: {
      tanah_dan_bangunan: [
        { deskripsi: 'Tanah & Bangunan Seluas 450 m2/300 m2 di Kota Jakarta Selatan, Hasil Sendiri', nilai: 5450000000 },
        { deskripsi: 'Tanah Seluas 1200 m2 di Kabupaten Bogor, Warisan', nilai: 3195951000 }
      ],
      alat_transportasi_dan_mesin: [
        { deskripsi: 'Mobil Toyota Fortuner 2.8 VRZ Tahun 2022, Hasil Sendiri', nilai: 400000000 }
      ],
      harta_bergerak_lainnya: [
        { deskripsi: 'Logam Mulia & Perhiasan Keluarga', nilai: 260000000 }
      ]
    }
  },
  {
    fileName: 'LHKPN_2024_Budi_Setiawan.pdf',
    isParsedSuccess: true,
    status: 'Selesai',
    identity: {
      nama: 'Ir. Budi Setiawan, M.Eng.',
      jabatan: 'Head of Infrastructure Development',
      nhk: 'NHK-8842104',
      bidang: 'Eksekutif',
      lembaga: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
      unit_kerja: 'Direktorat Jenderal Bina Marga',
      tanggal_penyampaian: '28 Februari 2024',
      jenis_laporan: 'Laporan Periodik',
      tahun_laporan: '2023',
      status_verifikasi: 'Terverifikasi Lengkap'
    },
    assets: {
      tanah_dan_bangunan: 24500000000,
      alat_transportasi_dan_mesin: 1200000000,
      harta_bergerak_lainnya: 850000000,
      surat_berharga: 1500000000,
      kas_dan_setara_kas: 950000000,
      harta_lainnya: 0,
      subtotal_harta: 29000000000,
      hutang: 4200000000,
      total_harta_kekayaan: 24800000000
    },
    itemized: {
      tanah_dan_bangunan: [
        { deskripsi: 'Tanah & Bangunan Seluas 800 m2 di Jakarta Barat', nilai: 14500000000 },
        { deskripsi: 'Ruko 3 Lantai di Kota Bandung', nilai: 10000000000 }
      ]
    }
  },
  {
    fileName: 'LHKPN_2024_Dewi_Lestari.pdf',
    isParsedSuccess: true,
    status: 'Selesai',
    identity: {
      nama: 'Dr. Dewi Lestari, S.H., M.H.',
      jabatan: 'Hakim Tinggi / Penyelenggara Negara',
      nhk: 'NHK-5521903',
      bidang: 'Yudikatif',
      lembaga: 'Mahkamah Agung RI',
      unit_kerja: 'Pengadilan Tinggi Jakarta',
      tanggal_penyampaian: '10 Januari 2024',
      jenis_laporan: 'Laporan Periodik',
      tahun_laporan: '2023',
      status_verifikasi: 'Terverifikasi Lengkap'
    },
    assets: {
      tanah_dan_bangunan: 3200000000,
      alat_transportasi_dan_mesin: 350000000,
      harta_bergerak_lainnya: 200000000,
      surat_berharga: 2800000000,
      kas_dan_setara_kas: 850000000,
      harta_lainnya: 0,
      subtotal_harta: 7400000000,
      hutang: 0,
      total_harta_kekayaan: 7400000000
    }
  },
  {
    fileName: 'LHKPN_2024_Hendra_Kusuma.pdf',
    isParsedSuccess: true,
    status: 'Selesai',
    identity: {
      nama: 'Hendra Kusuma, S.STP.',
      jabatan: 'Kepala Dinas Pengelolaan Keuangan',
      nhk: 'NHK-3321948',
      bidang: 'Eksekutif',
      lembaga: 'Pemerintah Provinsi DKI Jakarta',
      unit_kerja: 'Badan Pengelola Keuangan Daerah',
      tanggal_penyampaian: '20 Maret 2024',
      jenis_laporan: 'Laporan Periodik',
      tahun_laporan: '2023',
      status_verifikasi: 'Terverifikasi Lengkap'
    },
    assets: {
      tanah_dan_bangunan: 1800000000,
      alat_transportasi_dan_mesin: 1400000000,
      harta_bergerak_lainnya: 950000000,
      surat_berharga: 100000000,
      kas_dan_setara_kas: 150000000,
      harta_lainnya: 0,
      subtotal_harta: 4400000000,
      hutang: 1800000000,
      total_harta_kekayaan: 2600000000
    }
  },
  {
    fileName: 'LHKPN_2024_Eka_Suryani_SCAN.pdf',
    isParsedSuccess: false,
    status: 'Perlu Ditinjau',
    errorReason: 'Terdapat selisih nominal ekstraksi pada subtotal harta.',
    identity: {
      nama: 'Eka Suryani, M.Sc.',
      jabatan: 'Sekretaris Inspektorat Utama',
      nhk: 'NHK-7719230',
      bidang: 'Eksekutif',
      lembaga: 'Kementerian Riset dan Teknologi',
      unit_kerja: 'Inspektorat Utama',
      tanggal_penyampaian: '05 Maret 2024',
      jenis_laporan: 'Laporan Periodik',
      tahun_laporan: '2023',
      status_verifikasi: 'Perlu Ditinjau Manual'
    },
    assets: {
      tanah_dan_bangunan: 4500000000,
      alat_transportasi_dan_mesin: 300000000,
      harta_bergerak_lainnya: 150000000,
      surat_berharga: 0,
      kas_dan_setara_kas: 200000000,
      harta_lainnya: 0,
      subtotal_harta: 5800000000, // actual sum is 5150000000 -> trigger warning!
      hutang: 0,
      total_harta_kekayaan: 5800000000
    }
  }
];
