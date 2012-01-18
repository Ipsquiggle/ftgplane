/*
 * Copyright (C) 2011-2012 Frogtoss Games, Inc.
 *
 * This software is provided 'as-is', without any express or implied
 * warranty. In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 *    1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would be
 *    appreciated but is not required.
 *
 *    2. Altered source versions must be plainly marked as such, and must not
 *    be misrepresented as being the original software.
 *
 *    3. This notice may not be removed or altered from any source
 *    distribution.
 */

/*
  Things that need doing:

   - BUG: I can't get postGrayscale to deliver any differences in some
layers.  The first and last layer of zombie.xml for example.

   - More shaders!  DOF would be huge.

   - Helper function to set the projection uniform for all materials in texman

   - Blit intermediate to final at different stages, including post processing textures.

   - Particles. jfdi.  In 3d, using depth testing.

   - UIDs for putboxes so the calling code can pull them out and have handles to them.

   - API-level (not data-level) ease of rendering to texture, having
     that texture be placed in the texman and be referenced by further planespans.

   - Use VBOs, not drawarray calls for maximum performance.

  */

/* Scene globals */
var gl;
var scene = {};
scene.mvMatrix = mat4.create();
scene.pMatrix  = mat4.create();
scene.mvMatrixStack = [];
scene.closestZ = 1;
scene.rt = {};
scene.animateCamera = false;
scene.cameraPos = [0,0,1];
scene.lightPos = [1,1,1];

//
// Begin helpers
//

function mvPushMatrix( s ) {
    var copy = mat4.create();
    mat4.set( s.mvMatrix, copy );
    s.mvMatrixStack.push( copy );
}

function mvPopMatrix( s ) {
    if ( s.mvMatrixStack.length == 0 ) {
        throw "Invalid popMatrix!";
    }

    s.mvMatrix = s.mvMatrixStack.pop();
}

function getArg(name) {
    return decodeURI(
        (RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]
    );
}


//
// End helpers
//

function initBuffers( panel ) {
    /* plane setup */
    scene.planeSpan = new ftgPlaneSpan();

    // Programmatically generate panel or not
    if ( panel == 'null' ) {
        // Foreground one
        var p = scene.planeSpan.allocPlane();
        p.addObb( [0,0,0], [0.25,0.25], 0.0,  "alphatest.png" );
        p.material = ftg.mats['post'];

    }

    scene.planeSpan.updateZOrder();

    /* rendertarget setup */

    // Blit to screen on command or after no more planes exist

}


function draw() {
    {
        gl.viewport( 0, 0, gl.viewportWidth, gl.viewportHeight );

        mat4.perspective( 45, gl.viewportWidth / gl.viewportHeight, 1.0, 40960, scene.pMatrix );
        mat4.lookAt( scene.cameraPos, [0,0,0], [0,1,0], scene.mvMatrix );

        // Fixme: this isn't going to scale.
        ftg.mats.def.setProjectionUniform( scene.pMatrix );

        mvPushMatrix( scene );  
        scene.planeSpan.drawArrays( scene.mvMatrix );
        mvPopMatrix( scene );
    }

}


// Main loop
function tick() {
    // Update timer
    requestAnimFrame( tick );

    // Draw scene
    draw(); 
}



function webGLStart() {
    var canvas = document.getElementById( 'maincanvas' );

    // resize handling -- diabled for sluggishness
    //$(window).resize( function() {setCanvasSize();});

    console.log( "Disable resize handling.");

    gl = WebGLUtils.setupWebGL(canvas);
    gl.viewportWidth  = canvas.width;
    gl.viewportHeight = canvas.height;

    ftg.init( gl );

    scene.panel = getArg('panel');
    initBuffers( scene.panel );



    // mouse handling
    $(document).mousemove( function( e ) {
        scene.mouseX = parseFloat( event.pageX );
        scene.mouseY = parseFloat( event.pageY );
    });
    scene.mouseX = scene.mouseY = 0;

    $(document).keypress( function( e ) {
        var e = window.event || e;

        if ( e.keyCode == 32 ) // space
            scene.animateCamera = !scene.animateCamera;
    });
        
    /* cyan-green */
    gl.clearColor( 41/256, 69/256, 57/256, 1.0 );
    //gl.enable( gl.DEPTH_TEST );
    //gl.depthFunc( gl.ALWAYS );
    gl.enable( gl.BLEND );
    gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
    //gl.blendFunc( gl.SRC_ALPHA, gl.ONE );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    tick();



}
