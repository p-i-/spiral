var spiral = {
    N:              88, // notes
    basetoneme:     9,
    inner_radius:   .3,
    note_width:     0.85,
    max_amplitude:  0.9,

    recalc: function(GUI_scale) 
    {
        this.regenerate_all = true;

        // radius & position of innermost note
        this.R = Math.pow( this.inner_radius, 1/this.N );  
        this.ω = Z.fromPolar( this.R,  τ/12 );

        // rotation
        //this.Ω = Complex.Polar( 1,  this.basetoneme * τ/12 );

        // Find δ s.t. spiral * (1+δ)^+1 and spiral * (1+δ)^-1 meet as single amonite-groove
        // i.e. outside edge 1 rev in = inside edge
        //    R^12 * (1+δ) = 1/(1+δ) (12 hops => back to same radial)
        //    R^12 = (1+δ)^-2
        //    1+δ = R^12 ^ -½ = R^-6
        // So (1+δ)^k for k∈[-1,+1] spans this segment inner to outer
        this.δ = Math.pow(this.R,-6) - 1;

        // Equation of spiral: z(n) = ω^n, so e.g. z(2) = ω^2 i.e. centre of 3rd note
        this.z_n = function(n) { 
            //var θ = n * τ/12;
            //return this.z_θ(θ);
            return Z.fromPolar( Math.pow(this.R,n), n*τ/12 ); // this.ω['^'](Complex(n,0) );
            //return this.Ω['*']( this.ω['^'](Complex(n,0) ) ); //Complex.parseFunction( 'Ω * ω^n', [Ω,ω,n] ); 
        };

        this.z_θ = function(θ) { 
            var n = 12 * θ/τ;
            return this.z_n(n);
            //return Z.fromPolar( Math.pow(this.R, 12*θ/τ), θ ); //return this.ω['^'](Complex(12 * θ/τ,0) ); // 1 rev goes 0 thru 12
            //return this.Ω['*']( this.ω['^'](Complex(n,0) ) ); //Complex.parseFunction( 'Ω * ω^n', [Ω,ω,n] ); 
        };

        // length of spine for button 0
        // ∫z^n dn  [-½,+½]
        // θ(n) = n⋅τ/12 (check θ(1)... ok!), so dθ/dn = τ/12
        // r(n) = R^n
        // Δarclen = r⋅Δθ ∴ arclen  = ∫rdθ  = ∫r dθ/dn dn  = τ/12 {-½,+½}∫r dn 
        // and ∫r dn  = ∫R^n dn  = ∫exp(n ln(R)) dn  = exp(n ln R) / ln R = R^n / ln R
        // so arclen = (τ / 12 ln(R)) [R^n]{-½,+½}
        // = (τ / 12lnR) (√R - 1/√R)
        this.arc_0 = (Math.sqrt(this.R) - 1/Math.sqrt(this.R)) * τ / ( 12 * Math.log(this.R) );

        this.notes = new Array(this.N);

        for( var i=0,  toneme=this.basetoneme,  z0=this.z_n(-this.note_width/2),  arc=GUI_scale * this.arc_0
               ; i < this.notes.length
               ; i++,  toneme=(toneme+1)%12, z0['*='](this.ω),  arc *= this.R 
               ) 
        {
            var FUDGE_FACTOR = 8;
            var steps = Math.round(arc/FUDGE_FACTOR)+1,
                Δθ = this.note_width * (τ/12)/steps;
            
            this.notes[i] = {
                toneme:  toneme,
                z0:      this.z_n(i-this.note_width/2),
                steps:   steps,
                Δθ:      Δθ,
                Δz:      this.z_θ(Δθ),
                heat:    Math.random(),
                Δcisoid: Z.fromPolar(1,τ/steps),
                outer:   new Array(steps),
                inner:   new Array(steps)
            };
        };
    },

    gen_paths: function()
    {
        // // fast-estimates (1+x)^α using 2nd-order binomial approximation
        // //    http://en.wikipedia.org/wiki/Binomial_series
        // function power(x,α) {
        //     var ret = 1 + α*x + α*(α-1)*x*x/2;
        //     return ret;
        // }

        this.notes.forEach( function(note) {
            if(note.heat < .05 && ! spiral.regenerate_all) 
                return;
            
            var N = note.steps, 
                cisoid = new Z(1,0),
                //Δcisoid = Complex.Polar(1,τ/N), 
                spine = new Z(note.z0)
                ;

            for( var j=0; j<N;  j++, 
                                cisoid['*='](note.Δcisoid),
                                 spine['*='](note.Δz)        ) 
            {
                var cos_ϕ = cisoid.re,
                    env_01 = (1-cos_ϕ)/2,
                    heat = note.heat * env_01 * spiral.max_amplitude
                    ;
                
                //note.outer[j] = spine['*']( Complex( power(spiral.δ, +heat), 0 ) );
                //note.inner[j] = spine['*']( Complex( power(spiral.δ, -heat), 0 ) );

                note.outer[j] = spine['*'](     1 + spiral.δ * heat  );
                note.inner[j] = spine['*'](  1/(1 + spiral.δ * heat) );
            };
        });

        spiral.regenerate_all = false;
    },

    draw: function (X, drawInactives) // X is context
    {
        X.lineWidth = 2/GUI.scale;

        // draw unit circle
        if( drawInactives )
        {
            X.beginPath();
            X.arc(0, 0, 1, 0, τ, true); // x,y, r, startAngle, endAngle, anticlockwise
            X.closePath();
            X.fillStyle = GUI.backcolor.brighter(2).toString();
            X.fill();
        };
        
        this.notes.forEach( function(note) {
            if( note.heat < .05  &&  ! drawInactives ) 
                return;

            var Z = note.outer, z = note.inner, N = note.steps;

            X.beginPath();
            X.moveTo( -Z[0].re, Z[0].im ); // notice we flip x

            for( var i = 0;  i < N; ++i )
                X.lineTo( -Z[i].re, Z[i].im );

            for( var i = N-1;  i >= 0;  --i )
                X.lineTo( -z[i].re, z[i].im );

            X.closePath();

            var fill = d3.hsl( 30 * note.toneme, .5,         note.heat*.7 ).toString();
            var edge = d3.hsl( 30 * note.toneme, .7, .1 + .9*note.heat    ).toString();

            X.strokeStyle = edge; // d3.lab(fill).brighter(1);
            X.fillStyle   = fill;

            X.fill();
            X.stroke();
        });
    },

    click: function(z) {
        var z_flipx = new Z(-z.re, z.im),
            r = z_flipx.mag(), 
            θ = z_flipx.arg();  if(θ<0) θ += τ;

        var r_outer = this.z_θ(θ).mag(), // outer arm
            mag_ω = this.R;
        
        // r_outer * |ω|^12 = one octave in 
        // r_outer * |ω|^24 = 2 octaves inner
        // r_outer * |ω|^12k = k octaves in
        // r = r_outer * |ω|^12k
        // 12k ln |ω| = ln(r/r_outer)
        var octave = Math.round( Math.log(r/r_outer) / (12*Math.log(mag_ω)) ),
            θ12 = 12 * θ/τ,
            toneme = Math.round(θ12),
            note = 12*octave + toneme,
            offcenter = 2 * Math.abs( θ12 - toneme ),
            vol = 1 - offcenter;
        
        if( note >= 0  &&  note < 88 ) {
            this.notes[note].heat = (vol+.1) / 1.1;
            return {
                index: note,
                vol: vol
            }
        }
        else
            return {
                index: -1
            }
    }
};
